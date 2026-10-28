/**
 * db.js — Data layer for GutenTag
 * Uses Dexie.js (IndexedDB wrapper) to persist user + application data.
 *
 * Tables:
 *   users        — signed-up students { email, name, passwordHash, plan,
 *                  tutorLevel, topics[], createdAt }; plan:
 *                  beginner/intermediate/advanced. `topics` is a copy of the
 *                  plan's range pack made on creation: each entry is
 *                  { id, topic, visited, history[], flashcards[] } and
 *                  history keeps the tutor messages practiced on that topic
 *                  while flashcards holds the misspelled words harvested
 *                  from that topic, each with a misses count.
 *
 *   (flashcards stopped being its own table in v6 — harvested words now
 *   live on the user's topic tree, under each topic, so they can be
 *   counted and reinforced by the tutor per topic.)
 *   subscribers  — monthly newsletter signups { email, subscribedAt }
 *   chatSessions — service-bot conversations { key, messages[], updatedAt }
 *   settings     — app preferences { key, value } (e.g. theme)
 *
 *   (tutorSessions was removed in v4 — topic conversations live on the
 *   user's topic list now, and the no-topic chat is session-scoped.)
 *
 * Exposed globally as window.GutenDB (plain script, no imports needed).
 */

let DexieLib = window.Dexie;

if (!DexieLib) {
  // Dexie script failed to load (offline / CDN blocked) — degrade gracefully.
  console.warn("[db] Dexie.js not loaded — falling back to in-memory storage.");
  DexieLib = null;
}

const db = DexieLib
  ? new DexieLib("GutenTagDB")
  : null;

/* ------------------------------------------------------------------ */
/* Lesson plans — stored on the user at signup, and used to seed the   */
/* tutor's starting level when a tutor session begins.                 */
/* ------------------------------------------------------------------ */
const PLANS = {
  beginner: { label: "Beginner", range: "A1–A2", startLevel: "A1" },
  intermediate: { label: "Intermediate", range: "A2–B1", startLevel: "A2" },
  advanced: { label: "Advanced", range: "B1–C1", startLevel: "B1" },
};

/* Old package names (pre-tier era) map onto the three tiers.           */
const LEGACY_PLAN_MAP = {
  beginner: "beginner",
  prost: "beginner",
  kaffeeklatsch: "intermediate",
  intensiv: "advanced",
  autobahn: "advanced",
};

if (db) {
  db.version(1).stores({
    users: "++id, &email, name, plan, createdAt",
    subscribers: "++id, &email, subscribedAt",
    chatSessions: "++id, &key, updatedAt",
    tutorSessions: "++id, &key, updatedAt",
    settings: "&key",
  });
  /* v2 — the per-user tutor level lives on users. Plan data is kept
   * untouched here so v3 can map legacy package names onto tiers.        */
  db.version(2)
    .stores({
      users: "++id, &email, name, tutorLevel, createdAt",
    })
    .upgrade(async (tx) => {
      await tx.table("users").toCollection().modify((user) => {
        user.tutorLevel = user.tutorLevel ?? "A1";
      });
      // tutorLevel no longer lives in settings.
      await tx.table("settings").where("key").equals("tutorLevel").delete();
    });
  /* v3 — the lesson plan becomes a three-tier field (beginner /
   * intermediate / advanced), re-indexed so it can seed tutor sessions.  */
  db.version(3)
    .stores({
      users: "++id, &email, name, plan, tutorLevel, createdAt",
    })
    .upgrade(async (tx) => {
      await tx.table("users").toCollection().modify((user) => {
        user.plan = LEGACY_PLAN_MAP[user.plan] ?? "intermediate";
        // A1 means "level never chosen by the user" (the v2 default), so
        // give those users the starting level their mapped plan implies.
        const startLevel = PLANS[user.plan].startLevel;
        if (user.tutorLevel === "A1" && startLevel !== "A1") {
          user.tutorLevel = startLevel;
        }
      });
    });
  /* v4 — drop the tutorSessions table entirely: tutor practice is per
   * topic on the user profile (UserTopics), and the topicless chat is
   * intentionally session-only. Setting the schema to null deletes the
   * table (and its data) in Dexie. */
  db.version(4)
    .stores({
      tutorSessions: null,
    });
  /* v5 — flashcards harvested from tutor practice. One row per misspelled
   * German word per user per topic, so the Flashcards section can show
   * every user's own collection and filter it by topic. Rows:
   * { email, topicId, topic, german, english, active, createdAt }.        */
  db.version(5)
    .stores({
      flashcards: "++id, email, topicId, active",
    });
  /* v6 — flashcards move under the user's topic tree: each topic entry on
   * the user profile gains a `flashcards[]` array (indexable nothing —
   * cards are read via the user record itself), so every word is stored
   * with the topic it was missed on, together with a `misses` count that
   * grows every time the student misspells it again. The standalone
   * flashcards table is dropped and its rows are migrated onto the user
   * profiles in the upgrade transaction (which still sees v5 tables). */
  db.version(6)
    .stores({
      flashcards: null,
    })
    .upgrade(async (tx) => {
      let rows = [];
      try {
        rows = await tx.table("flashcards").toArray();
      } catch (err) {
        // Table already gone (upgrade retried / partial) — nothing to move.
        console.warn("[db] v6 upgrade: flashcards table unreadable", err);
      }
      if (!rows.length) return;
      const users = await tx.table("users").toArray();
      for (const user of users) {
        const mine = rows.filter((r) => r.email === user.email);
        if (!mine.length || !Array.isArray(user.topics)) continue;
        const topics = user.topics.map((t) => {
          const old = mine.filter((r) => Number(r.topicId) === Number(t.id));
          if (!old.length) return t;
          const cards = Array.isArray(t.flashcards) ? t.flashcards.slice() : [];
          const keys = new Set(cards.map((c) => String(c.german).toLowerCase()));
          for (const r of old) {
            if (keys.has(String(r.german).toLowerCase())) continue;
            cards.push({
              german: r.german,
              wrong: r.wrong || "",
              english: r.english,
              misses: 1,
              active: r.active !== false,
              createdAt: r.createdAt || Date.now(),
            });
            keys.add(String(r.german).toLowerCase());
          }
          return { ...t, flashcards: cards };
        });
        await tx.table("users").put({ ...user, topics });
      }
    });
}

/* ------------------------------------------------------------------ */
/* In-memory fallback (when IndexedDB/Dexie is unavailable)            */
/* ------------------------------------------------------------------ */
function makeMemoryStore() {
  const tables = { users: [], subscribers: [], chatSessions: [], settings: [] };
  let seq = 1;
  const norm = (table) => (tables[table] ??= []);
  return {
    async add(table, obj) {
      const row = { ...obj, id: seq++ };
      norm(table).push(row);
      return row.id;
    },
    async put(table, obj) {
      const arr = norm(table);
      const i = arr.findIndex((r) => r.id === obj.id);
      if (i >= 0) arr[i] = { ...obj }; else arr.push({ ...obj, id: seq++ });
      return obj.id;
    },
    async get(table, key) { return norm(table).find((r) => r.id === key) || null; },
    async delete(table, key) {
      const arr = norm(table);
      const i = arr.findIndex((r) => r.id === key);
      if (i >= 0) arr.splice(i, 1);
    },
    async where(table, field, value) { return norm(table).filter((r) => r[field] === value); },
    async table(table) { return norm(table).slice(); },
    isFallback: true,
  };
}

function makeDexieAdapter() {
  return {
    async add(table, obj) { return db[table].add(obj); },
    async put(table, obj) { return db[table].put(obj); },
    async get(table, key) {
      const row = await db[table].get(key);
      return row ?? null;
    },
    async delete(table, key) { return db[table].delete(key); },
    async where(table, field, value) { return db[table].where(field).equals(value).toArray(); },
    async table(table) { return db[table].toArray(); },
    isFallback: false,
  };
}

const store = db ? makeDexieAdapter() : makeMemoryStore();

/* ------------------------------------------------------------------ */
/* Password helper — small non-cryptographic hash (demo app).          */
/* NOTE: client-side storage is demo-grade; a real deployment would    */
/* use a backend with proper hashing (bcrypt/argon2).                  */
/* ------------------------------------------------------------------ */
async function hashPassword(password) {
  try {
    if (window.crypto?.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("dl::" + password));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (_) { /* fall through */ }
  return "plain:" + password; // last-resort (e.g. non-secure context)
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */
const Users = {
  async create({ name, email, password, plan = "intermediate" }) {
    email = email.trim().toLowerCase();
    const tier = PLANS[plan];
    if (!tier) throw new Error("Unknown lesson plan: " + plan);
    const existing = await store.where("users", "email", email);
    if (existing.length) throw new Error("This email is already registered. Bitte melde dich an!");
    const user = {
      name: name.trim(),
      email,
      passwordHash: await hashPassword(password),
      plan,
      tutorLevel: tier.startLevel, // the plan seeds the tutor's level
      createdAt: Date.now(),
    };
    const id = await store.add("users", user);
    return { id, ...user, passwordHash: undefined };
  },

  async findByEmail(email) {
    email = String(email || "").trim().toLowerCase();
    const rows = await store.where("users", "email", email);
    return rows[0] || null;
  },

  async authenticate(email, password) {
    const user = await Users.findByEmail(email);
    if (!user) throw new Error("No account found with that email — why not sign up? 🥨");
    const hash = await hashPassword(password);
    if (hash !== user.passwordHash) throw new Error("Falsches Passwort! Wrong password — try again.");
    const { passwordHash, ...safe } = user;
    return safe;
  },

  /* Save the tutor level (a per-user property of the user record). */
  async setLevel(email, tutorLevel) {
    const user = await Users.findByEmail(email);
    if (!user) return null;
    await store.put("users", { ...user, tutorLevel });
    return { ...user, tutorLevel, passwordHash: undefined };
  },
};

/* ------------------------------------------------------------------ */
/* User topics — the plan's range topic pack (public/data/topics/*.json)
/* copied onto the user profile when the account is created, so every
/* user has their own topics with a visited flag and a message history.
/* ------------------------------------------------------------------ */
const UserTopics = {
  /* Copy the plan's range pack onto the user profile if it is not there
   * yet. Runs implicitly at signup and also seeds legacy accounts the
   * first time they open My Tutor. */
  async ensure(email) {
    const user = await Users.findByEmail(email);
    if (!user) return null;
    if (Array.isArray(user.topics) && user.topics.length) return user.topics;
    if (!window.GutenTopics) return null; // topics.js not loaded
    const level = (PLANS[user.plan] || PLANS.beginner).startLevel;
    const pack = await window.GutenTopics.load(level);
    const topics = (pack.topics || []).map((t) => ({
      id: t.id,
      topic: t.topic,
      visited: false,
      history: [],
    }));
    if (!topics.length) return null;
    await store.put("users", { ...user, topics });
    return topics;
  },

  /* The user's own topic list (each entry keeps its message history). */
  async list(email) {
    const user = await Users.findByEmail(email);
    if (!user) return null;
    return (await UserTopics.ensure(email)) || user.topics || [];
  },

  /* Append a practiced turn [{ role, text }, …] to a topic's history and    * mark the topic visited (you practiced it). History is capped at 40 */
  async saveTurn(email, topicId, entries) {
    const user = await Users.findByEmail(email);
    if (!user) return null;
    const topics = (Array.isArray(user.topics) ? user.topics : []).map((t) => {
      if (Number(t.id) !== Number(topicId)) return t;
      return {
        ...t,
        history: (t.history || []).concat(entries).slice(-40),
        visited: true,
      };
    });
    await store.put("users", { ...user, topics });
    return topics.find((t) => Number(t.id) === Number(topicId)) || null;
  },

  /* Wipe one topic's message history and reset its visited flag, so the
   * topic counts as fresh again (e.g. when the Clear button is pressed). */
  async clearHistory(email, topicId) {
    const user = await Users.findByEmail(email);
    if (!user) return null;
    const topics = (Array.isArray(user.topics) ? user.topics : []).map((t) =>
      Number(t.id) === Number(topicId) ? { ...t, history: [], visited: false } : t
    );
    await store.put("users", { ...user, topics });
    return topics.find((t) => Number(t.id) === Number(topicId)) || null;
  },

  /* Mark a topic done (or not) on the user profile. */
  async setVisited(email, topicId, visited = true) {
    const user = await Users.findByEmail(email);
    if (!user) return null;
    const topics = (Array.isArray(user.topics) ? user.topics : []).map((t) =>
      Number(t.id) === Number(topicId) ? { ...t, visited } : t
    );
    await store.put("users", { ...user, topics });
    return topics.find((t) => Number(t.id) === Number(topicId)) || null;
  },
};

/* ------------------------------------------------------------------ */
/* Flashcards — misspelled German words harvested from tutor turns,     */
/* stored UNDER EACH TOPIC on the user profile (users.topics[].flashcards).
/* One card per { topic, german word }: the wrong form the student
/* wrote, the correct form, its English meaning, and `misses` — a count
/* of how many times the student has misspelled that word while
/* practicing the topic. Repeated misses increment the count (no new
/* row), so the tutor and the Flashcards tab can reinforce the
/* worst-offending words first. `active` false counts a card out of the
/* random practice deck until re-activated.                            */
const Flashcards = {
  /* Normalize a German word for de-dup comparisons (case, ß, umlauts). */
  _norm(word) {
    return String(word || "")
      .toLowerCase()
      .replace(/ß/g, "ss")
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .trim();
  },

  /* Store harvested words { wrong, correct, english }[] as flashcards
   * on the selected topic under the user profile. A word already on the
   * topic just gets its `misses` count bumped (and its recorded wrong
   * form refreshed) instead of duplicating a card. Returns the number
   * of NEW cards added.                                                */
  async addWords(email, topicId, words) {
    if (!email || !Array.isArray(words)) return 0;
    const user = await Users.findByEmail(email);
    if (!user || !Array.isArray(user.topics)) return 0;
    let added = 0;
    const topics = user.topics.map((t) => {
      if (Number(t.id) !== Number(topicId)) return t;
      const cards = Array.isArray(t.flashcards) ? t.flashcards.slice() : [];
      for (const w of words) {
        const german = String(w.correct || w.german || "").trim();
        const english = String(w.english || "").trim();
        if (!german || !english) continue;
        const key = Flashcards._norm(german);
        const existing = cards.find((c) => Flashcards._norm(c.german) === key);
        if (existing) {
          existing.misses = (existing.misses || 1) + 1;
          existing.wrong = String(w.wrong || w.misspelled || existing.wrong || "").trim();
        } else {
          cards.push({
            german,
            wrong: String(w.wrong || w.misspelled || "").trim(),
            english,
            misses: 1,
            active: true,
            createdAt: Date.now(),
          });
          added++;
        }
      }
      return { ...t, flashcards: cards };
    });
    await store.put("users", { ...user, topics });
    return added;
  },

  /* The flashcards under one topic of the user's topic tree. A topicId
   * is required — cards always live on the selected topic now.         */
  async list(email, topicId) {
    if (!email) return [];
    const user = await Users.findByEmail(email);
    const topic = (user?.topics || []).find(
      (t) => Number(t.id) === Number(topicId)
    );
    return Array.isArray(topic?.flashcards) ? topic.flashcards.slice() : [];
  },

  /* Count helper for the section header (all cards on the topic). */
  async counts(email, topicId) {
    const rows = await Flashcards.list(email, topicId);
    return { total: rows.length, active: rows.filter((r) => r.active).length };
  },

  /* Mark a card inactive (out of the deck) or active again. */
  async setActive(email, topicId, german, active) {
    const user = await Users.findByEmail(email);
    if (!user || !Array.isArray(user.topics)) return null;
    const key = Flashcards._norm(german);
    const topics = user.topics.map((t) => {
      if (Number(t.id) !== Number(topicId)) return t;
      const cards = (Array.isArray(t.flashcards) ? t.flashcards : []).map((c) =>
        Flashcards._norm(c.german) === key ? { ...c, active: !!active } : c
      );
      return { ...t, flashcards: cards };
    });
    await store.put("users", { ...user, topics });
    return { german, active: !!active };
  },

  /* Remove the flashcards stored under one topic of the user's topic
   * tree. Returns how many cards were cleared.                         */
  async clear(email, topicId) {
    if (!email) return 0;
    const user = await Users.findByEmail(email);
    if (!user || !Array.isArray(user.topics)) return 0;
    let n = 0;
    const topics = user.topics.map((t) => {
      if (Number(t.id) !== Number(topicId)) return t;
      n = (Array.isArray(t.flashcards) ? t.flashcards : []).length;
      return { ...t, flashcards: [] };
    });
    await store.put("users", { ...user, topics });
    return n;
  },
};

/* ------------------------------------------------------------------ */
/* Newsletter subscribers                                              */
/* ------------------------------------------------------------------ */
const Subscribers = {
  async subscribe(email) {
    email = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email looks a little off — check it please?");
    const existing = await store.where("subscribers", "email", email);
    if (existing[0]) {
      if (existing[0].unsubscribed) {
        await store.put("subscribers", { ...existing[0], unsubscribed: false, subscribedAt: Date.now() });
        return { already: false }; // resubscribed
      }
      return { already: true };
    }
    await store.add("subscribers", { email, subscribedAt: Date.now(), unsubscribed: false });
    return { already: false };
  },

  async count() {
    const all = await store.table("subscribers");
    return all.filter((s) => !s.unsubscribed).length;
  },
};

/* ------------------------------------------------------------------ */
/* Chat sessions (service bot), keyed by conversation key              */
/* ------------------------------------------------------------------ */
function sessionApi(table) {
  return {
    async load(key) {
      const rows = await store.where(table, "key", key);
      return rows[0]?.messages ?? [];
    },
    async save(key, messages) {
      const rows = await store.where(table, "key", key);
      if (rows[0]) await store.put(table, { ...rows[0], messages, updatedAt: Date.now() });
      else await store.add(table, { key, messages, updatedAt: Date.now() });
      return messages;
    },
    async clear(key) {
      const rows = await store.where(table, "key", key);
      if (rows[0]) await store.delete(table, rows[0].id);
    },
  };
}

const ChatSessions = sessionApi("chatSessions");

/* ------------------------------------------------------------------ */
/* Settings — app preferences (theme). Key/value rows in the settings  */
/* table; the tutor level deliberately lives on the user instead.      */
/* ------------------------------------------------------------------ */
const Settings = {
  async get(key) {
    const rows = await store.where("settings", "key", key);
    return rows[0]?.value;
  },
  async set(key, value) {
    const rows = await store.where("settings", "key", key);
    if (rows[0]) await store.put("settings", { ...rows[0], value });
    else await store.add("settings", { key, value });
    return value;
  },
};

/* ------------------------------------------------------------------ */
/* Global export + health check                                        */
/* ------------------------------------------------------------------ */
const GutenDB = {
  Users,
  UserTopics,
  Flashcards,
  Subscribers,
  ChatSessions,
  Settings,
  PLANS,
  isReady: () => !!DexieLib,
  usingFallback: () => store.isFallback === true,
};

window.GutenDB = GutenDB;

if (!DexieLib) {
  console.info("[db] Running without IndexedDB persistence — data will not survive reloads.");
}
