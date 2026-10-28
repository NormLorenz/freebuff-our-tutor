/**
 * tutor.js — GutenTag AI German Tutor
 *
 * Uses the ChatGPT API to act as a friendly German tutor: it replies at the
 * student's CEFR level (A1–C1), gently corrects mistakes, and gives short
 * English notes when helpful. Topic conversations are persisted by main.js
 * on the user's own topic list (GutenDB.UserTopics).
 *
 * Live replies go through the server's own proxy (POST /api/tutor), so the
 * OPENAI_API_KEY and model name never reach the browser. As a dev-only
 * override, a key set in localStorage ("openaiApiKey") still connects
 * directly to OpenAI. Without any key anywhere, a built-in practice mode
 * keeps the tutor usable offline.
 *
 * Exposed as window.GutenTutor.
 */
(function () {
  "use strict";

  const API_URL = "https://api.openai.com/v1/chat/completions"; // dev override only
  const PROXY_URL = "/api/tutor";

  /* weakWords — optional list of the student's most-misspelled words for
   * the currently selected topic, [{ german, english, misses }, …] with
   * miss counts, read from the user's topic tree (see js/db.js →
   * Flashcards). The tutor gets them in the system prompt so it can
   * reenforce exactly the words the student keeps getting wrong.        */
  function systemPrompt(level, topic, weakWords) {
    /* When a practice topic is selected, steer the roleplay toward it. */
    const topicLine = topic
      ? `\n\nThe current practice topic is "${topic}". Steer the conversation
and vocabulary toward that topic (gently — it is a prompt, not a script).`
      : "";
    /* Reinforcement: bring up the misspelled words (worst first) and give
       the student a natural chance to use them correctly this turn.      */
    const weakLine = Array.isArray(weakWords) && weakWords.length
      ? `\n\nWhile practicing this topic, the student has misspelled these German words
(count of times misspelled): ${weakWords
          .map((w) => `"${w.german}" (${w.misses || 1}×)`)
          .join(", ")}. Work the most-misspelled ones into your reply naturally
and/or gently invite the student to try them again, spelled correctly.`
      : "";
    return `
You are "Herr Grün", a warm, patient, encouraging German tutor at GutenTag,
a friendly German school in Berlin. The student's CEFR level is ${level}.${topicLine}${weakLine}

Rules:
- Reply primarily in simple ${level}-level German, correct and natural.
- If the student writes in German, gently correct mistakes: show the corrected
  sentence in bold (…**korrekt**…) followed by ≤2 short bullet notes.
- If the student writes in English, answer in German first, then add one short
  English translation in parentheses.
- Keep replies short (max ~120 words). Ask a small follow-up question to keep
  the conversation going.
- Be warm and a bit playful; light German vocabulary in context (Brot, Kaffee,
  spazieren) is welcome. Never overwhelm with grammar tables.`;
  }

  /* ---------------- ChatGPT call ---------------- */

  /* Two transports: the server proxy /api/tutor (normal path; key stays
   * server-side), or a direct OpenAI call with a personal localStorage
   * key (dev only). Returns null when no key is configured anywhere —
   * the caller then switches to offline practice mode.                  */
  function getApiKey() {
    try {
      return (
        localStorage.getItem("openaiApiKey") ||
        sessionStorage.getItem("openaiApiKey") ||
        ""
      );
    } catch (_) {
      return "";
    }
  }

  async function askViaProxy(payload) {
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 501) return null; // no server key → practice mode
    if (!res.ok) throw new Error("API error " + res.status);
    const data = await res.json();
    if (!data.reply) throw new Error("empty response");
    return data.reply;
  }

  async function askChatGPT(userMessage, level, history = [], topic = null, weakWords = null) {
    const payload = {
      messages: [
        { role: "system", content: systemPrompt(level, topic, weakWords) },
        ...history.slice(-10),
        { role: "user", content: userMessage },
      ],
      max_completion_tokens: 320,
      temperature: 0.7,
    };
    if (!getApiKey()) return askViaProxy(payload);

    const body = { ...payload, model: "gpt-4o-mini" }; // dev-override model; the server picks it on the proxy path
    // gpt-5* models only accept their default temperature
    if (/^gpt-5/.test(body.model)) delete body.temperature;
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getApiKey() },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = res.status === 401 ? "invalid API key" : "API error " + res.status;
      throw new Error(detail);
    }
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("empty response");
    return reply;
  }

  /* ---------------- Flashcard harvesting ---------------- */

  /* After a live ChatGPT tutor reply, run a small second call that scans
   * the student's message together with the tutor's corrections and
   * returns the misspelled / wrongly-used German words as strict JSON:
   *   [{ wrong, correct, english }, …]
   * Used by the Flashcards section (stored per user + topic). Returns []
   * when there is no API key, nothing was found, or anything fails —
   * harvesting is best-effort and must never break the chat.            */
  async function extractMisspellings(userMessage, level, tutorReply) {
    if (!userMessage || !tutorReply) return [];

    try {
      const payload = {
        messages: [
          {
            role: "system",
            content:
              `You harvest vocabulary from a German lesson for flashcards. The student's CEFR level is ${level}. ` +
              "You get the student's message and the tutor's reply, which contains corrected German. " +
              "Extract the German words from the STUDENT's message that are misspelled, wrongly used, " +
              "or that the tutor improved. For each one give the correct German word and a short, common " +
              "English translation. Drop proper nouns, numbers, and words the student already got right. " +
              "Return at most 5. Answer ONLY with a strict JSON array like " +
              '[{"wrong":"haus","correct":"Haus","english":"house"}] — no prose, no markdown.',
          },
          { role: "user", content: "Student (level " + level + "): " + userMessage + "\nTutor reply: " + tutorReply },
        ],
        max_completion_tokens: 300,
        temperature: 0,
      };
      let text;
      if (getApiKey()) {
        // Dev-only direct transport with the personal localStorage key.
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + getApiKey() },
          body: JSON.stringify({ ...payload, model: "gpt-4o-mini" }),
        });
        if (!res.ok) return [];
        const data = await res.json();
        text = data.choices?.[0]?.message?.content || "";
      } else {
        // Normal transport: the server proxy. null ⇒ no server key.
        text = await askViaProxy(payload) || "";
      }
      const match = text.match(/\[[\s\S]*\]/); // first JSON array in the reply
      if (!match) return [];
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((w) => w && w.correct && w.english)
        .slice(0, 5);
    } catch (_) {
      return []; // harvesting is best-effort
    }
  }

  /* ---------------- Offline practice mode ---------------- */

  const OFFLINE_REPLIES = [
    {
      test: /(hallo|hi|guten tag|hello)/i,
      reply: () =>
        "Hallo! Wie geht es dir heute? 😊\n(Hello! How are you today?)\n• Tipp: „Mir geht's gut, danke!\" = I'm fine, thanks!",
    },
    {
      test: /(wie geht|how are you)/i,
      reply: () =>
        "Mir geht es sehr gut, danke! Und dir? 🌞\n(I'm very well, thanks! And you?)",
    },
    {
      test: /(name|heiße|heisse|ich bin)/i,
      reply: () =>
        "Schön, dich kennenzulernen! Ich bin Herr Grün, dein Deutschlehrer. 🇩🇪\nWie heißt du?\n(Nice to meet you! …What's your name?)\n• Tipp: „Ich heiße …\" = My name is …",
    },
    {
      test: /(essen|food|eat|restaurant|ordering|kaffee|kuchen)/i,
      reply: () =>
        "Gern üben wir! 🥨 Im Café sagt man:\n• „Ich möchte einen Kaffee, bitte.\" — I'd like a coffee, please.\n• „Ein Stück Kuchen, bitte.\" — One piece of cake, please.\nVersuch's mal — schreib deinen Satz! (Try it — write your sentence!)",
    },
    {
      test: /(der die das|article|bestimmter artikel)/i,
      reply: () =>
        "Ah, der-die-das! 😄 A small trick:\n• -ung, -heit, -keit, -schaft, -ion → usually **die** (die Zeitung, die Freiheit)\n• -chen, -lein → always **das** (das Mädchen)\n• -ling, -ismus, most words ending in -er (male persons) → **der**\nProbier es: „___ Sonne\"? Richtig — **die** Sonne!",
    },
    {
      test: /(danke|thanks|dank)/i,
      reply: () => "Bitte, gern geschehen! 🌻 Mach weiter so — dein Deutsch wird mit jedem Satz besser!",
    },
    {
      test: /(tsch(ü|ue)ss|bye|auf wiedersehen|ciao)/i,
      reply: () => "Auf Wiedersehen! 👋 Bis bald — übe ein bisschen jeden Tag: Übung macht den Meister!",
    },
  ];

  const OPENERS = [
    "Sehr schön, danke fürs Schreiben! Can you try telling me in German what you did today?\n(What did you do today?)",
    "Toll! 🌟 Kleine Aufgabe: beschreib dein Frühstück in einem Satz. (Describe your breakfast in one sentence.)",
    "Danke! Und nun: Was möchtest du in Deutschland zuerst erleben? (What would you like to experience first in Germany?)",
  ];

  async function offlineReply(msg, turn, level, topic = null) {
    for (const r of OFFLINE_REPLIES) if (r.test.test(msg)) return r.reply();
    /* Selected topic: build the practice prompt directly around it. */
    if (topic) {
      return (
        "Lass uns üben: " + topic +
        "\n(Let's practice: " + topic + ")"
      );
    }
    /* No canned match: pull an opener from the level's topic pack
       (public/data/topics/<level>.json via window.GutenTopics). */
    try {
      const topic = window.GutenTopics ? await window.GutenTopics.random(level) : null;
      if (topic && topic.topic) {
        return (
          "Lass uns üben: " + topic.topic +
          "\n(Let's practice: " + topic.topic + ")"
        );
      }
    } catch (_) { /* fall through to canned openers */ }
    return OPENERS[turn % OPENERS.length];
  }

  /* ---------------- Public API ---------------- */

  async function reply(userMessage, level = "A1", history = [], topic = null, weakWords = null) {
    try {
      const ai = await askChatGPT(userMessage, level, history, topic, weakWords);
      if (ai) return { text: ai, source: "chatgpt" };
      return { text: await offlineReply(userMessage, history.length, level, topic), source: "practice" };
    } catch (err) {
      console.warn("[tutor] ChatGPT unavailable (" + err.message + ") — using practice mode.");
      return { text: await offlineReply(userMessage, history.length, level, topic), source: "practice" };
    }
  }

  window.GutenTutor = { reply, extractMisspellings, hasKey: () => !!getApiKey() };
})();
