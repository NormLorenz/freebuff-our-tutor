/**
 * api/tutor.js — Vercel Serverless Function for POST /api/tutor.
 *
 * The browser's AI German tutor (public/js/tutor.js) posts its messages
 * here; this function forwards them to OpenAI with the Authorization
 * header attached server-side, so OPENAI_API_KEY and OPENAI_MODEL never
 * reach the browser. Set both as Vercel environment variables.
 *
 * The actual proxy logic lives in api/_lib/openai-proxy.js, shared with
 * the local dev server (server.js) so both behave identically. Returns
 * 501 { error: "not_configured" } when no key is set — the tutor then
 * switches to its built-in offline practice mode (and misspelling
 * harvesting is simply skipped).
 */
const { handleOpenAiProxy } = require("./_lib/openai-proxy.js");

module.exports = handleOpenAiProxy;
