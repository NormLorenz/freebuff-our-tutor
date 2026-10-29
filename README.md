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
3. **Flashcards** — a tab inside My Tutor, driven by the shared topic dropdown
   that sits above the Chat and Flashcards tabs. Every live ChatGPT tutor
   reply harvests the misspelled German words from your message and stores
   them under that topic on your user record, each with a `misses` count that
   grows every time you misspell the same word again. The deck deals the
   selected topic's active words randomly, and the tutor gets your five
   worst-offender words passed into its prompt so answers reenforce exactly
   the words you keep getting wrong. You can mark a word inactive so it
   drops out of the deck until you put it back.
4. **Local accounts** — sign up (name, email, password, lesson level:
   Beginner A1–A2 / Intermediate A2–B1 / Advanced B1–C1) and sign in via the
   header button (or the plan CTAs in the Lessons section). Once signed in:
   the header button turns into **Sign Out** with a "Hi, *name*!" greeting,
   the **My Tutor** nav link (Flashcards lives inside it as a tab) appears,
   and the
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
- **AI service chat bot** (`public/js/chat.js` + Vercel function
  `api/chat.js`) — answers questions about lessons, prices, and how it all
  works, with live ChatGPT replies.
- **AI German tutor** (`public/js/tutor.js` + Vercel function
  `api/tutor.js`) — the "My Tutor" section that chats in German at your
  CEFR level (A1–C1) with gentle corrections and English notes. Also
  harvests misspellings from each tutor turn for the flashcard deck,
  receives your most-misspelled words for the topic in its system prompt
  (reinforcement), and falls back to a built-in offline practice mode
  without a key.
- **Local accounts, topics & flashcards** (`public/js/db.js`) — Dexie/IndexedDB
  storage of users (with per-user topic packs copied from the plan at
  signup; each topic keeps its own chat history and flashcard deck with
  miss counts), newsletter subscribers, chat sessions, and preferences.
  In-memory fallback when IndexedDB is unavailable.
- **Flashcards UI** (`public/js/flashcards.js`) — random flip-card deck
  scoped to the topic selected in the shared My Tutor dropdown, miss-count
  badges on cards and word chips (worst offenders first), the
  chip list capped at three visible rows (it scrolls the rest so the
  panel height stays stable), Mark Inactive, and a per-topic Clear
  Flashcards button.
- **Topic packs** (`public/js/topics.js` + `public/data/topics/*.json`) —
  CEFR-themed practice topics per range (A1–A2, A2–B1, B1–C1).
- **Wire-up** (`public/js/main.js`) — auth modal, session restore, theme
  toggle, hero state switching, service-bot chat, and the tutor section.
- **Static site + serverless AI proxy** — Vercel serves the `public/`
  folder as-is (no build step) and turns `api/chat.js` + `api/tutor.js`
  into Serverless Functions: POST `/api/chat` and `/api/tutor` forward the
  browser's messages to OpenAI with the `Authorization` header attached
  server-side. The OPENAI_API_KEY and model name never reach the browser,
  so the bot and tutor answer with live ChatGPT replies *without
  committing or leaking any secrets* (per-IP rate limit: 30
  requests/minute; 501 when no key is configured → the bots run in
  offline/practice mode).
- **Local dev server** (`server.js`) — zero-dependency Node static server
  for `npm start`. It loads a `.env` file (port from `process.env.PORT` or
  the file) and runs the *same* proxy handler as the Vercel functions
  (`api/_lib/openai-proxy.js`), so local and production behave identically.

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

No `.env`? The site still works: the chat bots run in offline/practice
mode, and as a dev-only override you can connect directly with a personal
key via `localStorage.setItem("openaiApiKey", "sk-...")` (browser console).

## Deploy to Vercel

Vercel is zero-config for this app: `vercel.json` skips the build step and
serves the contents of `public/` as the site root — so the bare root URL
(`/`) serves `index.html` directly and its relative asset paths (`css/`,
`js/`, `images/`, `data/`) resolve without any redirect. Every file in
`api/` becomes a **Serverless Function**: `/api/chat` and `/api/tutor`
proxy ChatGPT server-side in production, just like the old Node server.
(`npm start` is not used by Vercel — it only runs `server.js` for local
dev, and it reuses the identical proxy handler.)

### Option A — Deploy from GitHub (recommended)

1. Push this repository to GitHub — it is the deploy source. It is at
   <https://github.com/NormLorenz/freebuff-our-tutor.git>.
2. Go to <https://vercel.com/new> → click **Import Git Repository** → pick
   this repo (sign in with GitHub first if asked).
3. Vercel auto-detects a static project ("Other" preset, no build step).
   Leave the settings as imported and click **Deploy** — `vercel.json`
   already points the Output Directory at `public/`.
4. Add your OpenAI credentials: project → **Settings → Environment
   Variables**, add

   | Variable | Value |
   | --- | --- |
   | `OPENAI_API_KEY` | `sk-...` |
   | `OPENAI_MODEL` | `gpt-5.6-luna` (optional; any ChatGPT-compatible model works) |

   then **Deployments → ⋯ → Redeploy** once so the functions pick them up.
   Without a key the site still works fully — both bots run in
   offline/practice mode.
5. Your URL: **https://<project>.vercel.app** (the deployment preview URL
   already works; add a custom domain via **Settings → Domains**).

### Option B — Vercel CLI

```
npm i -g vercel
vercel login
vercel                          # preview deploy; first run asks to link
vercel env add OPENAI_API_KEY production        # paste the sk-... key
vercel env add OPENAI_MODEL production          # optional, e.g. gpt-5.6-luna
vercel --prod                   # production deploy with env vars attached
```

### After deploying

- Redeploys happen automatically on every push to the connected branch.
- **Do not commit your real `.env`** — set credentials as Vercel
  environment variables instead (Dashboard or `vercel env add`). On Vercel
  the functions read `process.env`; locally `server.js` prefers real env
  vars over any committed `.env` file, mirroring that behavior.
- Persistent data (accounts, flashcards, chats, theme) lives in each
  visitor's browser (IndexedDB), not on the server — redeploying or
  replacing a deployment loses no user data.
- Logs: project → **Deployments** → click the deployment → **Runtime
  Logs** (or `vercel logs` with the CLI).
- Note: the per-IP rate limit (30 requests/minute) on `/api/*` counts per
  serverless-function instance.

## Using the site

- **Sign up / Sign in** — via the header button (or the plan CTAs in the
  Lessons section). The session lasts until you sign out **or close the
  browser**; reloading the page keeps you signed in.
- **My Tutor** — appears in the nav (and the hero) once you're signed in. The
  tutor starts each session at the level your lesson plan implies (kept on
  your user record) and displays it as the plan's CEFR range — A1–A2
  (Beginner), A2–B1 (Intermediate), or B1–C1 (Advanced). Write in German or
  English; special characters (Ä ä Ö ö Ü ü ß) have insert buttons near the
  composer. A topic dropdown sits above the Chat and Flashcards tabs and
  drives both panes. 🗑️ **Clear History** wipes only the selected topic's
  chat.
- **Flashcards** — the second tab inside My Tutor, sharing the topic
  dropdown above the tabs; the deck is always the selected topic. Every
  live tutor ChatGPT reply harvests the misspelled German words from your
  message (stored under the topic with a miss count that grows on every
  repeat miss). Deal random cards (Next Card / Shuffle), click the card to
  flip the German word to its English meaning and the wrong form you
  wrote, press **Mark Inactive** to take a word out of the deck (click its
  ⛔ chip to put it back), or empty the topic's deck with 🗑️ **Clear
  Flashcards** (keeping the topic's chat history intact).
- **Sign out** — the header's "Sign Out" button (or the button inside the
  auth modal) ends the session immediately; closing the browser does it
  automatically.

## Tech stack

| Tech | Purpose |
| --- | --- |
| Plain HTML / CSS / JavaScript | The whole site — no build step, no framework |
| [Dexie](https://dexie.org/) (IndexedDB) | Local user accounts, topics, and flashcard decks |
| OpenAI Chat Completions | Live ChatGPT replies for bot + tutor (+ misspelling harvesting) — called via the server's `/api/chat` + `/api/tutor` proxy, never from the browser |
| Vercel (static + Serverless Functions) | Hosting in production — serves `public/` at the site root; `api/chat.js` + `api/tutor.js` run the OpenAI proxy |
| Node.js `http` module | The zero-dependency local dev server (`server.js`) |

### IndexedDB schema

The database (`GutenTagDB`, Dexie v6 after live migrations v1–v6) holds four
tables, all stored in the visitor's browser:

| Table (v5 index schema) | Stores | Key fields |
| --- | --- | --- |
| `users` (`++id, &email, name, plan, tutorLevel, createdAt`) | Signed-up students | `plan` = beginner/intermediate/advanced; `topics[]` = per-user copy of that plan's topic pack, each `{ id, topic, visited, history[], flashcards[] }` — `history[]` keeps the tutor messages practiced and `flashcards[]` the misspelled words harvested there, each `{ german, wrong, english, misses, active, createdAt }`; `tutorLevel` seeds the tutor |
| `subscribers` (`++id, &email, subscribedAt`) | Newsletter signups | one row per email (unique) |
| `chatSessions` (`++id, &key, updatedAt`) | Service-bot (Klaus) conversations | `key` unique per visitor, `messages[]` is the transcript |
| `settings` (`&key`) | App preferences (e.g. theme) | `key`/`value` pairs |

The `tutorSessions` table existed in v1–v3 and was deleted in v4 — topic
conversations now live on the user's topic list, and the no-topic chat is
session-scoped. The standalone `flashcards` table existed through v5 and
was deleted in v6 — harvested words now live under each topic on the user
record (with a `misses` count), so the tutor can reinforce them per topic;
the v6 upgrade migrates existing rows onto each user's topics. When
Dexie/IndexedDB is unavailable, everything above falls back to an in-memory
store for that page visit.

## Project structure
```
gutentag/
├── public/               # the whole static frontend (Vercel serves it at /)
│   ├── index.html        # single-page site — hero, plans, visit, about,
│   │                     #   auth modal, My Tutor + Flashcards sections
│   ├── css/
│   │   └── styles.css    # the entire design system (light/dark, responsive)
│   ├── js/               # browser scripts — loaded in this order (no bundling)
│   │   ├── db.js         # 1. GutenDB — Dexie/IndexedDB: users, topic packs,
│   │   │                 #    flashcards, subscribers, chat sessions, settings
│   │   ├── topics.js     # 2. GutenTopics — loads the per-range topic packs
│   │   ├── chat.js       # 3. GutenChat — service bot ("Klaus") ChatGPT Q&A
│   │   ├── tutor.js      # 4. GutenTutor — level-aware German tutor +
│   │   │                 #    misspelling harvesting + offline practice mode
│   │   ├── flashcards.js # 5. GutenFlashcards — deck UI for harvested words
│   │   └── main.js       # 6. wire-up: auth/session, hero swapping, theme,
│   │                     #    service bot + tutor + flashcard wiring
│   ├── data/
│   │   └── topics/
│   │       ├── a1-a2.json    # Beginner practice topics
│   │       ├── a2-b1.json    # Intermediate practice topics
│   │       └── b1-c1.json    # Advanced practice topics
│   └── images/           # logo, hero illustrations, team portraits, favicon
├── api/                  # Vercel Serverless Functions — OpenAI proxy
│   ├── chat.js           # POST /api/chat — proxies OpenAI (Klaus)
│   ├── tutor.js          # POST /api/tutor — proxies OpenAI (Herr Grün)
│   └── _lib/
│       └── openai-proxy.js  # shared handler: validation, rate limit,
│                         #   OpenAI call (functions + server.js both use it)
├── server.js             # zero-dependency local dev server (`npm start`):
│                         #   static files + redirect, same proxy handler
├── vercel.json           # no build step — serve public/ as the site root
├── .env.example          # template for OPENAI_API_KEY / OPENAI_MODEL / PORT
├── .gitignore            # keeps .env, .freebuff/, node_modules, caches out of git
├── package.json          # name/scripts only — no dependencies to install
├── package-lock.json     # lockfile (kept for tools that expect one)
└── README.md             # this file
```

Notes:
- The `public/js/*.js` files expose plain browser globals
  (`window.GutenDB`, `window.GutenTopics`, `window.GutenChat`,
  `window.GutenTutor`, `window.GutenFlashcards`) — load order in
  `index.html` matters (see the numbered tree above), there is no module
  bundling. The `api/*.js` files are Vercel Serverless Functions
  (CommonJS) — they are never loaded by the browser.
- User data never reaches the server: everything is stored in the visitor's
  browser (IndexedDB + `sessionStorage`), so the folders above are the whole
  deployment.

---

*Lernen, lachen, wachsen.* — learn, laugh, grow.

# TODO's

- Should package.json should use dexie and openai package dependancies?
- Find out which OpenAI model would be best for a German AI tutor
- ChatGPT history issue. It is forgetting my name.
- ~~Put the Flashcards missed words in a scrollable section. Display the first three rows.~~ ✅ Done — the chip list fits three rows (multiple words per row) and scrolls the rest (see `public/css/styles.css`), keeping the Flashcards panel height stable as the deck grows.
- ~~Railway default networking URL is https://freebuff-our-tutor-production.up.railway.app/public/#home instead of https://freebuff-our-tutor-production.up.railway.app. Why?~~ ✅ Fixed — `index.html` uses relative asset paths, so serving it at `/` broke CSS/JS/images (they resolved to `/css/...` → 404). `server.js` now 301-redirects `/` and `/public` to `/public/`, so the bare root URL works.
- ~~Rename dev-server.js to server.js~~ ✅ Done
- ~~Sign out the user when the browser is closed.~~ ✅ Done — the session is
  stored in `sessionStorage`, which the browser clears on close (see
  `public/js/main.js` → Restore session).
- ~~Create a new menu item 'Flashcards' and section that is built from mispelled German words and their English equivalent once the tutor ChatGPT call has returned. These words will be stored by user and topic. The flashcards will display words randomly and have the option to mark the word inactive.~~ ✅ Done — see the Flashcards section description above.
- ~~Consider moving the flashcards under the users/topic tree in the IndexedDB under each topic so that AI can reenforce words that are mispelled. Somehow keep count of the word mispelled and pass those to AI for reenforcement. The flashcards should only display those words for the topic selected. There should be a separate button to clear the history and a separate button to clear the flashcards for the selected topic. The topic dropdown should be located above the Chat and Flashcards tabs.~~ ✅ Done — flashcards now live on `users.topics[].flashcards` with a `misses` count (Dexie v6), the shared topic dropdown sits above the Chat/Flashcards tabs and drives both, the tutor receives the five worst-offender words in its prompt, and Clear History / Clear Flashcards are separate per-topic buttons.
