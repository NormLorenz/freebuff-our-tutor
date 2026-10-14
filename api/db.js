/**
 * db.js — Data layer for GutenTag
 * Uses Dexie.js (IndexedDB wrapper) to persist user + application data.
 *
 * Tables:
 *   users        — signed-up students { email, name, passwordHash, plan,
 *                  tutorLevel, createdAt }; plan: beginner/intermediate/advanced
 *   subscribers  — monthly newsletter signups { email, subscribedAt }
 *   chatSessions — service-bot conversations { key, messages[], updatedAt }
 *   tutorSessions— German tutor conversations { key, messages[], updatedAt }
 *   settings     — app preferences { key, value } (e.g. theme)
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
}

/* ------------------------------------------------------------------ */
/* In-memory fallback (when IndexedDB/Dexie is unavailable)            */
/* ------------------------------------------------------------------ */
function makeMemoryStore() {
  const tables = { users: [], subscribers: [], chatSessions: [], tutorSessions: [], settings: [] };
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
/* Chat sessions (service bot + tutor), keyed by conversation key       */
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
const TutorSessions = sessionApi("tutorSessions");

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
  Subscribers,
  ChatSessions,
  TutorSessions,
  Settings,
  PLANS,
  isReady: () => !!DexieLib,
  usingFallback: () => store.isFallback === true,
};

window.GutenDB = GutenDB;

if (!DexieLib) {
  console.info("[db] Running without IndexedDB persistence — data will not survive reloads.");
}
