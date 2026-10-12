/**
 * chat.js — DeutschLust service Q&A bot
 *
 * Uses the ChatGPT API to answer questions about the services offered.
 * Configure by setting OPENAI_API_KEY in localStorage (key: "openaiApiKey")
 * or window.OPENAI_API_KEY before the page loads.
 *
 * If no key is set (or the API call fails), a friendly local "FAQ mode"
 * answers common questions so the site still works fully offline.
 *
 * Exposed as window.DeutschChat.
 */
(function () {
  "use strict";

  const MODEL = "gpt-4o-mini";
  const API_URL = "https://api.openai.com/v1/chat/completions";

  const SYSTEM_PROMPT = `
You are "Bruno", the warm and friendly assistant for DeutschLust — a German
language tutoring school in Berlin run by a husband-and-wife team (Anna and
Lukas Keller). Answer questions about the school's services only, in the
language of the user's question (English or German). Be concise (max ~120
words), warm, and sprinkle a little German cheer ("Gerne!", "Sehr gerne!").

Service facts you may share:
- Plans: "Prost Beginner" A1–A2 €39/month (2 group lessons/week, daily AI drills);
  "Kaffeeklatsch" A2–B1 €59/month (3 lessons/week, weekly 1-on-1, unlimited AI tutor);
  "Autobahn Intensiv" B1–C1 €89/month (4 intensive lessons/week, Goethe/TestDaF exam prep, business German).
- Free first trial lesson for everyone. Sign up via the "Sign In / Sign Up" button.
- AI German tutor is included in every plan, available 24/7 via the "My Tutor" button.
- Address: Lindenallee 14, 10115 Berlin (Mitte). Phone: +49 30 1234 5678.
  Email: hallo@deutschlust.example.
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
        window.OPENAI_API_KEY ||
        localStorage.getItem("openaiApiKey") ||
        sessionStorage.getItem("openaiApiKey") ||
        ""
      );
    } catch (_) {
      return window.OPENAI_API_KEY || "";
    }
  }

  function setApiKey(key) {
    if (key) localStorage.setItem("openaiApiKey", key);
    else localStorage.removeItem("openaiApiKey");
  }

  /* ---------------- Local FAQ fallback ---------------- */

  const FAQ = [
    {
      match: /(price|cost|preis|kosten|how much|wie viel|europ|€)/i,
      reply: () =>
        "Preise / Prices 🥨\n• Prost Beginner (A1–A2): €39/month\n• Kaffeeklatsch (A2–B1): €59/month — our favorite! ⭐\n• Autobahn Intensiv (B1–C1): €89/month\nEvery plan includes unlimited chats with the AI tutor, and your first trial lesson is free. Gerne!",
    },
    {
      match: /(hours|open|öffnung|zeiten|when.*(open|closed)|sunday|sonntag|samstag|weekend)/i,
      reply: () =>
        "Our doors are open: 🕒\nMon–Fri 9:00–19:00 · Sat 10:00–15:00 · Sunday — geschlossen (closed). Sunday we recharge with Kaffee und Kuchen!",
    },
    {
      match: /(address|location|where|adresse|standort|visit|finden)/i,
      reply: () =>
        "You'll find us at Lindenallee 14, 10115 Berlin (Mitte). 📍\nPhone: +49 30 1234 5678 · Email: hallo@deutschlust.example\nSwing by — there's usually Streuselkuchen!",
    },
    {
      match: /(level|beginner|advanced|a1|a2|b1|b2|c1|niveau|anf)/i,
      reply: () =>
        "We teach every level, A1 through C1: from first „Hallo\" to fluent small talk and business German. Not sure where you fit? Start from A1 — we'll move you up as soon as you're ready. Jeder Schritt zählt!",
    },
    {
      match: /(trial|free|probe|gratis|kostenlos|first lesson)/i,
      reply: () =>
        "Ja! Your first trial lesson is completely free — click \"Sign In / Sign Up\", pick a package, and bis bald! 🎉",
    },
    {
      match: /(newsletter|news|email me|subscribe|abonnie)/i,
      reply: () =>
        "Our monthly newsletter brings one cozy email: tips, idioms („Tomaten auf den Augen?\" 🍅), and events. You can subscribe right in the Visit section below. Sehr gerne!",
    },
    {
      match: /(teacher|team|who|anna|lukas|instructor|lehrer)/i,
      reply: () =>
        "We're Anna & Lukas Keller, a husband-and-wife team. 💛 Anna (head teacher, from Heidelberg) makes grammar fun; Lukas (tech lead, from Dresden) built our AI tutor. Come meet us in the About section!",
    },
    {
      match: /(tutor|ai|bot|chat|practice|üben)/i,
      reply: () =>
        "Your AI tutor is included in every plan and available 24/7 — just tap the 🇩🇪 \"My Tutor\" button, pick your level (A1–C1), and practice whenever you like. Viel Spaß!",
    },
    {
      match: /(online|in.?person|zoom|video|class format|hiybrid)/i,
      reply: () =>
        "Both! 😊 We teach in our cozy Berlin classroom and online via video. Small groups, gemütlich atmosphere, either way.",
    },
    {
      match: /(cancel|refund|kündigung|pause|freeze)/i,
      reply: () =>
        "Life happens — our monthly plans pause or cancel anytime with two weeks' notice, and unused 1-on-1 sessions roll over one month. Fair, oder?",
    },
  ];

  function localFAQReply(question) {
    for (const f of FAQ) if (f.match.test(question)) return f.reply();
    return (
      "Gute Frage! I can happily help with lessons, prices, levels, our address, " +
      "opening hours, the newsletter, or our teachers. 🥨\n(Tip: for rich AI answers, " +
      "an OpenAI API key can be set — ask with the key configured and I'll be even smarter!)"
    );
  }

  /* ---------------- ChatGPT call ---------------- */

  async function askChatGPT(userMessage, history = []) {
    const key = getApiKey();
    if (!key) return null; // signal: use fallback

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-10),
      { role: "user", content: userMessage },
    ];

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.6, max_tokens: 300 }),
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

  /* ---------------- Public API ---------------- */

  async function ask(question, history = []) {
    try {
      const ai = await askChatGPT(question, history);
      if (ai) return { text: ai, source: "chatgpt" };
      return { text: localFAQReply(question), source: "faq" };
    } catch (err) {
      console.warn("[chat] ChatGPT unavailable (" + err.message + ") — using FAQ mode.");
      return { text: localFAQReply(question), source: "faq" };
    }
  }

  window.DeutschChat = { ask, getApiKey, setApiKey, hasKey: () => !!getApiKey() };
})();
