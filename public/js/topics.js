/**
 * topics.js — shared loader for the per-level topic JSON files.
 *
 * Files live in ../data/topics/<level>.json (e.g. a1.json) relative to
 * this script, so both the page (main.js) and the tutor (tutor.js) get
 * the same data through window.GutenTopics:
 *
 *   const pack  = await GutenTopics.load("A1");   // full pack, cached
 *   const topic = await GutenTopics.random("B1"); // one random topic
 *   const list  = await GutenTopics.list();       // levels with files
 *
 * Levels are case-insensitive ("a1", "A1", " a1 " all work). If a level
 * file is missing, load() falls back to the nearest available level so
 * callers never have to handle rejection.
 */
(function () {
  "use strict";

  const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
  const BASE = new URL("../data/topics/", document.currentScript.src);
  const BASE_URL = BASE.href;

  const cache = {}; // lowercased level -> resolved pack | null (failed)

  function normalize(level) {
    return String(level || "").trim().toUpperCase();
  }

  /** Nearest lower level that still has a file, else the lowest level. */
  function fallbackFor(level) {
    const idx = LEVELS.indexOf(level);
    return idx > 0 ? LEVELS[idx - 1] : LEVELS[0];
  }

  async function loadRaw(level) {
    const key = normalize(level);
    if (key in cache) return cache[key];
    try {
      const res = await fetch(BASE_URL + key.toLowerCase() + ".json");
      if (!res.ok) throw new Error(res.status + " for " + key);
      const pack = await res.json();
      if (!pack || !Array.isArray(pack.topics)) throw new Error("malformed pack");
      cache[key] = pack;
      return pack;
    } catch (err) {
      console.warn("[topics] no pack for " + key + " (" + err.message + ")");
      cache[key] = null; // remember the miss so we don't refetch
      return null;
    }
  }

  async function load(level) {
    const key = normalize(level);
    let pack = await loadRaw(key);
    if (!pack) pack = await loadRaw(fallbackFor(key));
    return pack || { level: key, title: key, description: "", topics: [] };
  }

  async function random(level, excludeId) {
    const pack = await load(level);
    let pool = pack.topics;
    if (excludeId && pool.length > 1) {
      const filtered = pool.filter(function (t) { return t.id !== excludeId; });
      if (filtered.length) pool = filtered;
    }
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  async function list() {
    // Cheap existence probe: the dev server answers 200 with JSON, a miss is 404.
    const out = [];
    for (const lvl of LEVELS) {
      if (await loadRaw(lvl)) out.push(lvl);
    }
    return out;
  }

  window.GutenTopics = { LEVELS: LEVELS, load: load, random: random, list: list };
})();
