/**
 * tutor.js — GutenTag AI German Tutor
 *
 * Uses the ChatGPT API to act as a friendly German tutor: it replies at the
 * student's CEFR level (A1–C1), gently corrects mistakes, and gives short
 * English notes when helpful. Conversation is persisted via GutenDB.
 *
 * Configure the model key the same way as chat.js (localStorage
 * "openaiApiKey" or window.OPENAI_API_KEY). Without a key, a built-in
 * practice mode keeps the tutor usable offline.
 *
 * Exposed as window.GutenTutor.
 */
(function () {
  "use strict";

  const MODEL = window.OPENAI_MODEL || "gpt-4o-mini";
  const API_URL = "https://api.openai.com/v1/chat/completions";

  function systemPrompt(level) {
    return `
You are "Herr Grün", a warm, patient, encouraging German tutor at GutenTag,
a friendly German school in Berlin. The student's CEFR level is ${level}.

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

  function getApiKey() {
    try {
      return (
        window.OPENAI_API_KEY ||
        localStorage.getItem("openaiApiKey") ||
        sessionStorage.getItem("openaiApiKey") ||
        ""
      );
    } catch (_) {
      return window.OPENAI_API_KEY || "";
    }
  }

  async function askChatGPT(userMessage, level, history = []) {
    const key = getApiKey();
    if (!key) return null;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt(level) },
          ...history.slice(-10),
          { role: "user", content: userMessage },
        ],
        max_completion_tokens: 320,
        // gpt-5* models only accept their default temperature
        ...( /^gpt-5/.test(MODEL) ? {} : { temperature: 0.7 } ),
      }),
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

  async function offlineReply(msg, turn, level) {
    for (const r of OFFLINE_REPLIES) if (r.test.test(msg)) return r.reply();
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

  async function reply(userMessage, level = "A1", history = []) {
    try {
      const ai = await askChatGPT(userMessage, level, history);
      if (ai) return { text: ai, source: "chatgpt" };
      return { text: await offlineReply(userMessage, history.length, level), source: "practice" };
    } catch (err) {
      console.warn("[tutor] ChatGPT unavailable (" + err.message + ") — using practice mode.");
      return { text: await offlineReply(userMessage, history.length, level), source: "practice" };
    }
  }

  window.GutenTutor = { reply, hasKey: () => !!getApiKey() };
})();
