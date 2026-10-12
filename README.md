# GutenTag — Friendly German Tutoring 🥨

*Willkommen! Welcome!* GutenTag is a warm, cozy German tutoring website with a
built-in AI service chat bot and a 24/7 AI German tutor — from your first
„Hallo“ to fluent conversation. *Gemütlichkeit included.*

## What's inside

- **Marketing site** (`public/index.html`) — hero, lesson plans (Prost
  Beginner → Kaffeeklatsch → Autobahn Intensiv), visit/contact info, about
  the husband-and-wife team, newsletter signup, and a sign-in/sign-up modal.
- **AI service chat bot** (`api/chat.js`) — answers questions about lessons,
  prices, and how it all works, with live ChatGPT replies.
- **AI German tutor** (`api/tutor.js`) — a floating tutor panel that chats in
  German at your CEFR level (A1–C1) with gentle corrections and English notes.
- **Local accounts & chat history** (`api/db.js`) — Dexie/IndexedDB storage
  with clear-history buttons for both chat widgets.
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
