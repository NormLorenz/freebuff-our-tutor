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
3. **Flashcards** — every time a live ChatGPT tutor reply comes back, the
   misspelled German words from your message are extracted and stored per user
   and per topic. The Flashcards section deals them randomly in a flip-card
   deck and lets you mark a word inactive so it drops out of the deck until
   you put it back.
4. **Local accounts** — sign up (name, email, password, lesson level:
   Beginner A1–A2 / Intermediate A2–B1 / Advanced B1–C1) and sign in via the
   header button (or the plan CTAs in the Lessons section). Once signed in:
   the header button turns into **Sign Out** with a "Hi, *name*!" greeting,
   the **My Tutor** and **Flashcards** nav links and sections appear, and the
   **hero swaps to a member view** — a personalized "Willkommen zurück,"
   greeting plus *Mein Tutor 🎙️* and *Meine Flashcards 🃏* buttons instead of
   the marketing pitch. The session lives in `sessionStorage`, so **closing
   the browser signs you out automatically** (page reloads keep you signed
   in), while your tutor level, topic progress, and flashcard deck persist in
   IndexedDB.
5. Everything is stored client-side — Dexie/IndexedDB for accounts, topics,
   flashcards, and chat history, `sessionStorage` for the session only — so
   there is no backend account database. This is deliberately demo-grade, not
   production auth (passwords are SHA-256 hashed in the browser, not salted).

The rest is a cozy landing page: hero, three equally-presented lesson plans
(Beginner €39, Intermediate €59, Advanced €89), a Visit section with
address/phone/hours plus newsletter signup, About the husband-and-wife team,
and a footer. Light/dark theme toggle, fully responsive down to phone sizes,
and graceful fallbacks when offline or without an OpenAI key.

## What's inside

- **Marketing + member site** (`public/index.html`) — dual-state hero (guest
  marketing vs. signed-in My Tutor/Flashcards CTAs), lesson plans (Beginner
  €39 → Intermediate €59 → Advanced €89), visit/contact info with newsletter
  signup and the chat bot, about the team, and a sign-in/sign-up modal.
- **AI service chat bot** (`api/chat.js`) — answers questions about lessons,
  prices, and how it all works, with live ChatGPT replies.
- **AI German tutor** (`api/tutor.js`) — the "My Tutor" section that chats in
  German at your CEFR level (A1–C1) with gentle corrections and English
  notes. Also harvests misspellings from each tutor turn for the flashcard
  deck, and falls back to a built-in offline practice mode without a key.
- **Local accounts, topics & flashcards** (`api/db.js`) — Dexie/IndexedDB
  storage of users (with per-user topic packs copied from the plan at
  signup and per-topic chat history), flashcards, newsletter subscribers,
  chat sessions, and preferences, with clear-history buttons for both chat
  widgets. In-memory fallback when IndexedDB is unavailable.
- **Flashcards UI** (`public/js/flashcards.js`) — random flip-card deck,
  topic filter, active/inactive word chips, and a per-user clear button.
- **Topic packs** (`public/js/topics.js` + `public/data/topics/*.json`) —
  CEFR-themed practice topics per range (A1–A2, A2–B1, B1–C1).
- **Wire-up** (`public/js/main.js`) — auth modal, session restore, theme
  toggle, hero state switching, service-bot chat, and the tutor section.
- **Zero-dependency server** (`server.js`) — plain Node.js static server
  that loads a `.env` file and injects the OpenAI credentials into the served
  HTML (port from `process.env.PORT`, so it works on hosting platforms) so
  the bot and tutor answer with live ChatGPT replies *without committing any
  secrets*.

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

## Publish to Railway

Railway runs the same server (`npm start` → `node server.js`); the app
reads `PORT` from the environment, which Railway sets automatically, so no
code changes are needed. Visiting the Railway root URL
(`https://<app>.up.railway.app`) now works directly: the server 301-
redirects `/` to `/public/`, because `index.html` references its assets
with relative paths (`css/`, `js/`, `images/`) that only resolve under
`/public/`.

### Option A — Deploy from GitHub (recommended)

1. Push this repository to GitHub — it is the deploy source. It is at
   <https://github.com/NormLorenz/freebuff-our-tutor.git>.
2. Go to <https://railway.new> → **Deploy from GitHub repo** → pick this repo
   (sign in with GitHub first if asked).
3. Railway auto-detects Node.js and runs `npm start`. Nothing to configure.
4. Add your OpenAI credentials: in the service → **Variables** tab, add

   | Variable | Value |
   | --- | --- |
   | `OPENAI_API_KEY` | `sk-...` |
   | `OPENAI_MODEL` | `gpt-5.6-luna` (optional; defaults to `gpt-4o-mini`) |

   ⚠️ This app is a demo and passes the key to the browser for direct API
   calls, so the key is visible in the served HTML. Use a scoped, low-limit
   key and rotate it if it leaks.
5. Create a public URL: service → **Settings → Networking** → **Generate
   Domain** (or add a custom domain). `/` redirects to `/public/`, the site
   home.

### Option B — Railway CLI

```
npm i -g @railway/cli
railway login
railway init                     # create the project in the repo root
railway variables set OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-5.6-luna
railway up                       # deploy (auto-detect: npm start)
railway domain                   # get your public URL
```

### After deploying

- Redeploys happen automatically on every push to the connected branch.
- **Do not commit your real `.env`** — set credentials as Railway variables
  instead. Railway injects them into `process.env`, which the server prefers
  over any committed file.
- Persistent data (accounts, flashcards, chats, theme) lives in each
  visitor's browser (IndexedDB), not on Railway — redeploying or replacing a
  deployment loses no user data.
- Logs: `railway logs` (CLI) or the service's **Deployments → View Logs**.

## Using the site

- **Sign up / Sign in** — via the header button (or the plan CTAs in the
  Lessons section). The session lasts until you sign out **or close the
  browser**; reloading the page keeps you signed in.
- **My Tutor** — appears in the nav (and the hero) once you're signed in. The
  tutor starts each session at the level your lesson plan implies (kept on
  your user record) and displays it as the plan's CEFR range — A1–A2
  (Beginner), A2–B1 (Intermediate), or B1–C1 (Advanced). Write in German or
  English; special characters (Ä ä Ö ö Ü ü ß) have insert buttons near the
  composer. Per-topic histories keep ✓ progress marks and can be cleared
  with 🗑️.
- **Flashcards** — appears in the nav (and the hero) once you're signed in.
  Every live tutor ChatGPT reply harvests the misspelled German words from
  your message (stored per user + topic). Deal random cards (Next Card /
  Shuffle), click the card to flip the German word to its English meaning,
  press **Mark Inactive** to take a word out of the deck (click its ⛔ chip
  to put it back), filter the deck by topic, or clear your whole collection
  with 🗑️.
- **Sign out** — the header's "Sign Out" button (or the button inside the
  auth modal) ends the session immediately; closing the browser does it
  automatically.

## Tech stack

| Tech | Purpose |
| --- | --- |
| Plain HTML / CSS / JavaScript | The whole site — no build step, no framework |
| [Dexie](https://dexie.org/) (IndexedDB) | Local user accounts, topics, and flashcard decks |
| OpenAI Chat Completions | Live ChatGPT replies for bot + tutor (+ misspelling harvesting) |
| Node.js `http` module | The zero-dependency server (works locally and on Railway) |

## Project structure
```
gutentag/
├── api/                  # AI + data layer (browser globals, no imports)
│   ├── chat.js           # GutenChat — service bot ("Klaus") ChatGPT Q&A
│   ├── tutor.js          # GutenTutor — level-aware German tutor +
│   │                     #   misspelling harvesting + offline practice mode
│   └── db.js             # GutenDB — Dexie/IndexedDB: users, topic packs,
│                         #   flashcards, subscribers, chat sessions, settings
├── public/
│   ├── index.html        # single-page site — hero, plans, visit, about,
│   │                     #   auth modal, My Tutor + Flashcards sections
│   ├── css/
│   │   └── styles.css    # the entire design system (light/dark, responsive)
│   ├── js/
│   │   ├── main.js       # wire-up: auth/session, hero swapping, theme,
│   │   │                 #   service bot + tutor + flashcard wiring
│   │   ├── flashcards.js # GutenFlashcards — deck UI for harvested words
│   │   └── topics.js     # GutenTopics — loads the per-range topic packs
│   ├── data/
│   │   └── topics/
│   │       ├── a1-a2.json    # Beginner practice topics
│   │       ├── a2-b1.json    # Intermediate practice topics
│   │       └── b1-c1.json    # Advanced practice topics
│   └── images/           # logo, hero illustrations, team portraits, favicon
├── server.js             # zero-dependency Node static server (:PORT, .env →
│                         #   HTML injection of the OpenAI credentials)
├── .env.example          # template for OPENAI_API_KEY / OPENAI_MODEL
├── .gitignore            # keeps .env, .freebuff/, caches out of git
├── package.json          # name/scripts only — no dependencies to install
└── package-lock.json     # lockfile (kept for tools that expect one)
```

Notes:
- The `api/*.js` and `public/js/*.js` files expose plain browser globals
  (`window.GutenChat`, `window.GutenTutor`, `window.GutenDB`,
  `window.GutenTopics`, `window.GutenFlashcards`) — load order in
  `index.html` matters, there is no module bundling.
- User data never reaches the server: everything is stored in the visitor's
  browser (IndexedDB + `sessionStorage`), so the folders above are the whole
  deployment.

---

*Lernen, lachen, wachsen.* — learn, laugh, grow.

# TODO's

- Should package.json should use dexie and openai package dependancies?
- Find out which OpenAI model would be best for a German AI tutor
- ~~Railway default networking URL is https://freebuff-our-tutor-production.up.railway.app/public/#home instead of https://freebuff-our-tutor-production.up.railway.app. Why?~~ ✅ Fixed — `index.html` uses relative asset paths, so serving it at `/` broke CSS/JS/images (they resolved to `/css/...` → 404). `server.js` now 301-redirects `/` and `/public` to `/public/`, so the bare root URL works.
- ChatGPT history issue. It is forgetting my name.
- ~~Rename dev-server.js to server.js~~ ✅ Done
- ~~Sign out the user when the browser is closed.~~ ✅ Done — the session is
  stored in `sessionStorage`, which the browser clears on close (see
  `public/js/main.js` → Restore session).
- ~~Create a new menu item 'Flashcards' and section that is built from mispelled German words and their English equivalent once the tutor ChatGPT call has returned. These words will be stored by user and topic. The flashcards will display words randomly and have the option to mark the word inactive.~~ ✅ Done — see the Flashcards section description above.
