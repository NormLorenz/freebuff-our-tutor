/**
 * topics.js — shared loader for the per-range topic JSON files.
 *
 * Files live in ../data/topics/<range>.json relative to this script,
 * so both the page (main.js) and the tutor (tutor.js) get the same data
 * through window.GutenTopics:
 *
 *   const pack  = await GutenTopics.load("A1-A2");   // full pack, cached
 *   const topic = await GutenTopics.random("B1");    // one random topic
 *   const list  = await GutenTopics.list();          // ranges with files
 *
 * A single CEFR letter ("a1", "A1", " a1 " all work) is resolved onto the
 * range file that covers that level (A1–A2, A2–B1, or B1–C1). Unknown
 * levels fall back to the first available range, so callers never have to
 * handle rejection.
 */
(function () {
  "use strict";

  const LEVELS = ["A1-A2", "A2-B1", "B1-C1"];
  /* CEFR letter → range file that includes that level; boundary letters
     resolve to the range named after them (A2 → A2-B1, B1 → B1-C1). */
  const LETTER_TO_RANGE = {
    A1: "A1-A2",
    A2: "A2-B1",
    B1: "B1-C1",
    B2: "B1-C1",
    C1: "B1-C1",
  };
  const BASE = new URL("../data/topics/", document.currentScript.src);
  const BASE_URL = BASE.href;

  const cache = {}; // range -> resolved pack | null (failed)

  function normalize(level) {
    return String(level || "").trim().toUpperCase();
  }

  /** Resolve any level key (letter or range) onto an existing range file. */
  function resolve(level) {
    const key = normalize(level);
    if (LEVELS.includes(key)) return key;
    return LETTER_TO_RANGE[key] || LEVELS[0];
  }

  async function loadRaw(range) {
    if (range in cache) return cache[range];
    try {
      const res = await fetch(BASE_URL + range.toLowerCase() + ".json");
      if (!res.ok) throw new Error(res.status + " for " + range);
      const pack = await res.json();
      if (!pack || !Array.isArray(pack.topics)) throw new Error("malformed pack");
      cache[range] = pack;
      return pack;
    } catch (err) {
      console.warn("[topics] no pack for " + range + " (" + err.message + ")");
      cache[range] = null; // remember the miss so we don't refetch
      return null;
    }
  }

  async function load(level) {
    const range = resolve(level);
    const pack = await loadRaw(range);
    return pack || { level: range, title: range, description: "", topics: [] };
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
    for (const range of LEVELS) {
      if (await loadRaw(range)) out.push(range);
    }
    return out;
  }

  window.GutenTopics = { LEVELS: LEVELS, load: load, random: random, list: list };
})();
