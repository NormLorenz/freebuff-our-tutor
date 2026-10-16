# GutenTag — Friendly German Tutoring 🥨

*Willkommen! Welcome!* GutenTag is a warm, cozy German tutoring website with a
built-in AI service chat bot and a 24/7 AI German tutor — from your first
„Hallo“ to fluent conversation. *Gemütlichkeit included.*

## Summary

A single-page marketing + learning site with three AI-powered pieces:

1. **Klaus, the service chat bot** (Visit section) — answers any question about
   lessons, prices, hours, and the team, with live ChatGPT replies and
   clear-history support.
2. **Herr Grün, the AI German tutor** (My Tutor section) — a members-only chat
   that writes German at your CEFR level (A1–C1) with gentle corrections and
   English notes. You reach it via the "My Tutor" nav link that appears once
   you are signed in.
3. **Local accounts** — sign up (name, email, password, and a lesson level:
   Beginner A1–A2, Intermediate A2–B1, or Advanced B1–C1) or sign in through
   the auth modal. The chosen plan is stored on the user and seeds the AI
   tutor's starting level for every tutor session. While signed in, the
   header button turns into **Sign Out** with a "Hi, *name*!" greeting next
   to it, and your chosen CEFR level plus your tutor chat history persist
   between visits. Everything is
   stored client-side
   (Dexie/IndexedDB + `localStorage` for the session), so there is no backend
   account database — this is deliberately demo-grade, not production auth.

The rest is a cozy landing page: hero, three equally-presented lesson plans
(Beginner €39, Intermediate €59, Advanced €89), Visit section
with address/phone/hours plus newsletter signup, About the husband-and-wife
team, and a footer. Light/dark theme toggle, fully responsive down to phone
sizes, and graceful fallbacks when offline or without an OpenAI key.

## What's inside

- **Marketing site** (`public/index.html`) — hero, lesson plans (Beginner
  €39 → Intermediate €59 → Advanced €89), visit/contact info with
  newsletter signup and the chat bot, about the husband-and-wife team, and a
  sign-in/sign-up modal.
- **AI service chat bot** (`api/chat.js`) — answers questions about lessons,
  prices, and how it all works, with live ChatGPT replies.
- **AI German tutor** (`api/tutor.js`) — the "My Tutor" page section that chats
  in German at your CEFR level (A1–C1) with gentle corrections and English
  notes. Visible only to signed-in users, reachable from the nav link.
- **Local accounts & chat history** (`api/db.js`) — Dexie/IndexedDB storage of
  users, newsletter subscribers, chat sessions, and preferences, with
  clear-history buttons for both chat widgets.
- **Zero-dependency dev server** (`dev-server.js`) — plain Node.js static
  server that loads a `.env` file and injects the OpenAI credentials into the
  served HTML so the bot and tutor answer with live ChatGPT replies *without
  committing any secrets*.

## Getting started

1. Install Node.js (any recent LTS version — there are no npm dependencies to
   install).
2. Copy `.env.example` to `.env` and add your OpenAI API key:

   ```
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-5.6-luna   # the default; any ChatGPT-compatible model works
   ```

3. Start the dev server:

   ```
   npm start
   ```

4. Open **http://localhost:3000/public/** (or whatever `PORT` you set) and
   start your German journey — *Auf geht's!*

No `.env`? The site still works: open the browser console (F12) and run
`localStorage.setItem("openaiApiKey", "sk-...")` to set a key locally, or use
the chat bots in offline/local-fallback mode.

## Using the site

- **Sign up / Sign in** — via the header button (or the plan CTAs in the
  Lessons section). Your session is remembered until you sign out.
- **My Tutor** — appears in the nav once you're signed in; the tutor starts
  each session at the level your lesson plan implies (kept on your user
  record) and displays it as the plan's CEFR range — A1–A2 (Beginner),
  A2–B1 (Intermediate), or B1–C1 (Advanced) — and remembers your
  conversation (clear it any time with the 🗑️ button).
- **Sign out** — the header's "Sign Out" button (or the button inside the
  auth modal) ends the session and hides the tutor section again.

## Tech stack

| Tech | Purpose |
| --- | --- |
| Plain HTML / CSS / JavaScript | The whole site — no build step, no framework |
| [Dexie](https://dexie.org/) (IndexedDB) | Local user accounts and chat history |
| OpenAI Chat Completions | Live ChatGPT replies for bot + tutor |
| Node.js `http` module | The zero-dependency dev server |

## Project structure

```
api/            chat.js (service bot) · tutor.js (AI tutor) · db.js (IndexedDB)
public/         index.html · css/ · js/ · images/
dev-server.js   static server with .env → HTML credential injection
.env.example    template for your OpenAI credentials
```

---

*Lernen, lachen, wachsen.* — learn, laugh, grow.

# To Do
- should package.json should use dexie and openai package dependancies?
- Find out which OpenAI model would be best for a German AI tutor.
