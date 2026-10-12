/**
 * db.js — Data layer for GutenTag
 * Uses Dexie.js (IndexedDB wrapper) to persist user + application data.
 *
 * Tables:
 *   users        — signed-up students { email, name, passwordHash, plan, createdAt }
 *   subscribers  — monthly newsletter signups { email, subscribedAt }
 *   chatSessions — service Q&A bot conversations { userId|email, messages[], updatedAt }
 *   tutorSessions— German tutor conversations { level, messages[], updatedAt }
 *   settings     — app preferences { key, value } (e.g. theme, tutorLevel)
 *
 * Exposed globally as window.GutenDB (plain script, no imports needed).
 */

let DexieLib = window.Dexie;
let initWarned = false;

if (!DexieLib) {
  // Dexie script failed to load (offline / CDN blocked) — degrade gracefully.
  console.warn("[db] Dexie.js not loaded — falling back to in-memory storage.");
  DexieLib = null;
}

const db = DexieLib
  ? new DexieLib("GutenTagDB")
  : null;

if (db) {
  db.version(1).stores({
    users: "++id, &email, name, plan, createdAt",
    subscribers: "++id, &email, subscribedAt",
    chatSessions: "++id, &key, updatedAt",
    tutorSessions: "++id, &key, updatedAt",
    settings: "&key",
  });
}

/* ------------------------------------------------------------------ */
/* In-memory fallback (when IndexedDB/Dexie is unavailable)            */
/* ------------------------------------------------------------------ */
function makeMemoryStore() {
  const store = { users: [], subscribers: [], chatSessions: [], tutorSessions: [], settings: [] };
  let seq = 1;
  const norm = (table) => (store[table] ??= []);
  return {
    async add(table, obj) {
      const row = { ...obj, id: seq++ };
      norm(table).push(row);
      return row.id;
    },
    async get(table, key) { return norm(table).find((r) => r.id === key) || null; },
    async put(table, obj) {
      const arr = norm(table);
      const i = arr.findIndex((r) => r.id === obj.id);
      if (i >= 0) arr[i] = { ...obj }; else arr.push({ ...obj, id: seq++ });
      return obj.id;
    },
    async where(table, field, value) { return norm(table).filter((r) => r[field] === value); },
    async table(table) { return norm(table).slice(); },
    async delete(table, key) {
      const arr = norm(table);
      const i = arr.findIndex((r) => r.id === key);
      if (i >= 0) arr.splice(i, 1);
    },
    async getSetting(key) { const s = store.settings.find((r) => r.key === key); return s ? s.value : undefined; },
    async setSetting(key, value) {
      const s = store.settings.find((r) => r.key === key);
      if (s) s.value = value; else store.settings.push({ key, value });
    },
    isFallback: true,
  };
}

function makeDexieAdapter() {
  return {
    async add(table, obj) { return db[table].add(obj); },
    async get(table, key) {
      const row = await db[table].get(key);
      return row ?? null;
    },
    async put(table, obj) { return db[table].put(obj); },
    async where(table, field, value) { return db[table].where(field).equals(value).toArray(); },
    async table(table) { return db[table].toArray(); },
    async delete(table, key) { return db[table].delete(key); },
    async getSetting(key) {
      const row = await db.settings.get(key);
      return row ? row.value : undefined;
    },
    async setSetting(key, value) { return db.settings.put({ key, value }); },
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
/* Users                                                              */
/* ------------------------------------------------------------------ */
const Users = {
  async create({ name, email, password, plan = "kaffeeklatsch" }) {
    email = email.trim().toLowerCase();
    const existing = await store.where("users", "email", email);
    if (existing.length) throw new Error("This email is already registered. Bitte melde dich an!");
    const user = {
      name: name.trim(),
      email,
      passwordHash: await hashPassword(password),
      plan,
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
};

/* ------------------------------------------------------------------ */
/* Newsletter subscribers                                             */
/* ------------------------------------------------------------------ */
const Subscribers = {
  async subscribe(email) {
    email = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email looks a little off — check it please?");
    const existing = await store.where("subscribers", "email", email);
    if (existing.length) return { already: true };
    const unsub = existing[0];
    if (unsub?.unsubscribed) {
      await store.put("subscribers", { ...unsub, unsubscribed: false, subscribedAt: Date.now() });
    } else {
      await store.add("subscribers", { email, subscribedAt: Date.now(), unsubscribed: false });
    }
    return { already: false };
  },

  async count() {
    const all = await store.table("subscribers");
    return all.filter((s) => !s.unsubscribed).length;
  },
};

/* ------------------------------------------------------------------ */
/* Chat sessions (service bot + tutor)                                */
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
/* Settings (theme, tutor level, last user)                           */
/* ------------------------------------------------------------------ */
const Settings = {
  get: (key) => store.getSetting(key),
  set: (key, value) => store.setSetting(key, value),
};

/* ------------------------------------------------------------------ */
/* Global export + health check                                       */
/* ------------------------------------------------------------------ */
const GutenDB = {
  Users,
  Subscribers,
  ChatSessions,
  TutorSessions,
  Settings,
  isReady: () => !!DexieLib,
  usingFallback: () => store.isFallback === true,
};

window.GutenDB = GutenDB;

if (!DexieLib && !initWarned) {
  initWarned = true;
  console.info("[db] Running without IndexedDB persistence — data will not survive reloads.");
}
