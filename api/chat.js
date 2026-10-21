/**
 * chat.js — GutenTag service Q&A bot
 *
 * Uses the ChatGPT API to answer questions about the services offered.
 * Live replies go through the server's own proxy (POST /api/chat), so the
 * OPENAI_API_KEY and model name never reach the browser. As a dev-only
 * override, a key set in localStorage ("openaiApiKey") still connects
 * directly to OpenAI from the browser.
 *
 * Exposed as window.GutenChat.
 */
(function () {
  "use strict";

  const API_URL = "https://api.openai.com/v1/chat/completions"; // dev override only
  const PROXY_URL = "/api/chat";

  const SYSTEM_PROMPT = `
You are "Klaus", the warm and friendly assistant for GutenTag — a German
language tutoring school in Berlin run by a husband-and-wife team (Anna and
Lukas Keller). Answer questions about the school's services only, in the
language of the user's question (English or German). Be concise (max ~120
words), warm, and sprinkle a little German cheer ("Gerne!", "Sehr gerne!").

Service facts you may share:
- Plans: "Beginner" A1–A2 €39/month (2 group lessons/week, daily AI drills);
  "Intermediate" A2–B1 €59/month (3 lessons/week, weekly 1-on-1, unlimited AI tutor);
  "Advanced" B1–C1 €89/month (4 intensive lessons/week, Goethe/TestDaF exam prep, business German).
- Free first trial lesson for everyone. Sign up via the "Sign In / Sign Up" button.
- AI German tutor is included in every plan, available 24/7 via the "My Tutor" button.
- Address: Lindenallee 14, 10115 Berlin (Mitte). Phone: +49 30 1234 5678.
  Email: hallo@gutentag.example.
- Hours: Mon–Fri 9:00–19:00, Sat 10:00–15:00, Sunday closed.
- Monthly newsletter with learning tips and events — subscribe in the "Visit" section.
- Teachers: Anna Keller (head teacher, 12 years experience, from Heidelberg)
  and Lukas Keller (learning-tech lead, AI tutor designer, from Dresden).
If asked something unrelated to the school or learning German, politely steer
the conversation back with a smile.`;

  /* ---------------- API key helpers ---------------- */

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

  function setApiKey(key) {
    if (key) localStorage.setItem("openaiApiKey", key);
    else localStorage.removeItem("openaiApiKey");
  }

  /* ---------------- ChatGPT call ---------------- */

  /* One shared message builder + two transports:
   *  - server proxy /api/chat (normal path; key stays server-side), or
   *  - direct call to OpenAI with a personal localStorage key (dev only). */
  function buildMessages(userMessage, history) {
    return [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-10),
      { role: "user", content: userMessage },
    ];
  }

  async function askViaProxy(messages) {
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, max_completion_tokens: 300, temperature: 0.6 }),
    });
    if (res.status === 501) throw new Error("no API key");
    if (!res.ok) throw new Error("API error " + res.status);
    const data = await res.json();
    if (!data.reply) throw new Error("empty response");
    return data.reply;
  }

  async function askDirect(messages) {
    const MODEL = "gpt-4o-mini"; // dev-override transport only; the server picks the model on the proxy path
    const body = { model: MODEL, messages, max_completion_tokens: 300 };
    // gpt-5* models only accept their default temperature
    if (!/^gpt-5/.test(MODEL)) body.temperature = 0.6;
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + getApiKey(),
      },
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

  async function askChatGPT(userMessage, history = []) {
    const messages = buildMessages(userMessage, history);
    return getApiKey() ? askDirect(messages) : askViaProxy(messages);
  }

  /* ---------------- Public API ---------------- */

  async function ask(question, history = []) {
    try {
      const ai = await askChatGPT(question, history);
      return { text: ai, source: "chatgpt" };
    } catch (err) {
      console.error("[chat] ChatGPT unavailable: " + err.message);
      return {
        text:
          "Entschuldigung! I couldn't reach the AI service just now 😔 — please try " +
          "again in a moment. If it keeps failing, the server's OPENAI_API_KEY " +
          "is not set (live replies need it on the server).",
        source: "error",
      };
    }
  }

  window.GutenChat = { ask, getApiKey, setApiKey, hasKey: () => !!getApiKey() };
})();
