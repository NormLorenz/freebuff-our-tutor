/**
 * mistakes.js — GutenTag mistake extractor
 *
 * A separate ChatGPT-driven service for the AI German tutor: it looks at the
 * tutor's previous ChatGPT response (which contains gentle corrections) and
 * pulls out a structured list of mistakes the student made. Each mistake is
 * returned as:
 *
 *   { german:  "<the mistaken German as the student wrote it>",
 *     english: "<short English translation / explanation of the fix>",
 *     active:  true }
 *
 * Configure the model key the same way as tutor.js (localStorage
 * "openaiApiKey" or window.OPENAI_API_KEY). Without a key — or on any API
 * error — it returns an empty list so the tutor flow never breaks.
 *
 * Exposed as window.GutenMistakes.
 */
(function () {
  "use strict";

  const MODEL = window.OPENAI_MODEL || "gpt-4o-mini";
  const API_URL = "https://api.openai.com/v1/chat/completions";

  function systemPrompt(level) {
    return `
You are a German grammar analyst for GutenTag, a German language school.
A student's ChatGPT tutor reply is given to you. The tutor (working at CEFR
level ${level}) gently corrects the student's German mistakes inside its
reply (corrected sentences are shown, often in bold, with short notes).

Extract every German mistake the student made that the tutor corrected.
Return ONLY strict JSON in exactly this shape:

{"mistakes":[{"german":"<the mistaken German phrase as the student wrote it>","english":"<short English translation of what the student meant / what went wrong>","active":true}]}

Rules:
- "german" quotes the student's flawed German (not the tutor's correction).
- "english" is a short English translation of the corrected meaning.
- "active" is always true for a newly extracted mistake.
- Do not invent mistakes the tutor did not correct.
- If the tutor corrected nothing, return {"mistakes":[]}.`;
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

  /* ---------------- ChatGPT call (strict JSON mode) ---------------- */

  async function askMistakes(tutorReply, level) {
    const key = getApiKey();
    if (!key) return null;

    const body = {
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt(level) },
        { role: "user", content: tutorReply },
      ],
      max_completion_tokens: 500,
      response_format: { type: "json_object" },
      // gpt-5* models only accept their default temperature
      ...(/^gpt-5/.test(MODEL) ? {} : { temperature: 0.2 }),
    };

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = res.status === 401 ? "invalid API key" : "API error " + res.status;
      throw new Error(detail);
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) throw new Error("empty response");

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      throw new Error("invalid JSON response");
    }
    return parsed;
  }

  /* Normalize whatever comes back into { german, english, active } entries. */
  function normalize(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map((m) => ({
        german: typeof m?.german === "string" ? m.german.trim() : "",
        english: typeof m?.english === "string" ? m.english.trim() : "",
        active: true,
      }))
      .filter((m) => m.german || m.english);
  }

  /* ---------------- Public API ---------------- */

  /**
   * Extract structured mistakes from a tutor ChatGPT response.
   * Resolves to an array of { german, english, active: true } — never rejects:
   * failures (no key, API error, malformed output) resolve to [] so the tutor
   * flow keeps working.
   */
  async function extract(tutorReply, level = "A1") {
    if (!tutorReply || typeof tutorReply !== "string") return [];
    try {
      const parsed = await askMistakes(tutorReply, level);
      if (!parsed) return []; // no API key — nothing to extract
      return normalize(parsed.mistakes);
    } catch (err) {
      console.warn("[mistakes] extraction unavailable (" + err.message + ") — skipping.");
      return [];
    }
  }

  window.GutenMistakes = { extract, hasKey: () => !!getApiKey() };
})();
