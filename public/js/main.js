/**
 * main.js — wires up the GutenTag UI.
 * Requires window.GutenDB (api/db.js), window.GutenChat (api/chat.js),
 * and window.GutenTutor (api/tutor.js).
 */
(function () {
  "use strict";
  const DB = window.GutenDB;
  const Chat = window.GutenChat;
  const Tutor = window.GutenTutor;
  const Flash = window.GutenFlashcards; // Flashcards section (js/flashcards.js)

  Flash.init(); // cache the section DOM + set the signed-out default

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ================================================================
     Theme (light / dark) — persisted in IndexedDB, cached in DOM early
     ================================================================ */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    if (DB) DB.Settings.set("theme", theme);
    try { localStorage.setItem("dl-theme", theme); } catch (_) { /* ok */ }
  }

  (function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("dl-theme"); } catch (_) { /* ok */ }
    if (!saved) {
      saved = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", saved);
    if (DB) DB.Settings.set("theme", saved); // sync to IndexedDB on boot
  })();

  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  /* ================================================================
     Year in footer
     ================================================================ */
  $("#year").textContent = new Date().getFullYear();

  /* ================================================================
     Mobile nav
     ================================================================ */
  const nav = $("#mainNav");
  const burger = $("#navBurger");
  burger.addEventListener("click", () => {
    nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(nav.classList.contains("open")));
  });
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a") || e.target.closest("button")) nav.classList.remove("open");
  });

  /* ================================================================
     Shared chat helpers
     ================================================================ */
  function addBubble(logEl, text, kind) {
    const div = document.createElement("div");
    div.className = "bubble bubble-" + kind;
    div.textContent = text;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
    return div;
  }

  function addTypingIndicator(logEl) {
    const div = document.createElement("div");
    div.className = "bubble bubble-bot";
    div.innerHTML = '<span class="typing-dots"><i></i><i></i><i></i></span>';
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
    return div;
  }

  function formMsg(el, text, ok) {
    el.textContent = text;
    el.classList.toggle("ok", !!ok);
    el.classList.toggle("err", !ok);
  }

  /* ================================================================
     Newsletter (Visit section)
     ================================================================ */
  const newsletterForm = $("#newsletterForm");
  newsletterForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = $("#newsletterMsg");
    const email = $("#newsEmail").value.trim();
    if (!DB) { formMsg(msgEl, "Storage unavailable.", false); return; }
    try {
      const result = await DB.Subscribers.subscribe(email);
      formMsg(
        msgEl,
        result.already
          ? "You're already on the list — danke!!"
          : "Danke! You're subscribed to the monthly newsletter. 📬",
        true
      );
      newsletterForm.reset();
    } catch (err) {
      formMsg(msgEl, err.message, false);
    }
  });

  /*
     Tutor section state — declared before the auth section below because
     the session-restore code calls refreshAuthState(), which renders the
     tutor history into the My Tutor section.
   */
  const panel = $("#tutor");
  const tutorLog = $("#tutorLog");
  const tutorForm = $("#tutorForm");
  const tutorInput = $("#tutorInput");
  const topicSelect = $("#tutorTopicSelect");
  let tutorLevel = "A1"; // always taken from the user's record (plan-seeded)
  let tutorBusy = false;
  let tutorMessages = [];
  let tutorLoaded = false;
  let userTopics = []; // the user's own topic pack (copied at signup)
  let currentTopicId = null; // topic whose history is open (null = general chat)

  /* ================================================================
     Auth modal (signup / signin)
     ================================================================ */
  const modal = $("#authModal");
  const signupForm = $("#signupForm");
  const signinForm = $("#signinForm");
  const successBox = $("#authSuccess");
  let currentUser = null;

  function openAuth(tab) {
    modal.hidden = false;
    showTab(tab || "signup");
    refreshAuthState();
    (tab === "signin" ? $("#siEmail") : $("#sgName")).focus();
  }
  function closeAuth() {
    modal.hidden = true;
    successBox.hidden = true;
    signupForm.hidden = false;
    signinForm.hidden = true;
  }

  function showTab(which) {
    const isSignup = which === "signup";
    $("#tabSignup").classList.toggle("is-active", isSignup);
    $("#tabSignin").classList.toggle("is-active", !isSignup);
    $("#tabSignup").setAttribute("aria-selected", String(isSignup));
    $("#tabSignin").setAttribute("aria-selected", String(!isSignup));
    signupForm.hidden = !isSignup;
    signinForm.hidden = isSignup;
    $("#authTitle").hidden = !isSignup; // h2 lives in signup form
    $("#authSuccess").hidden = true;
  }

  function refreshAuthState() {
    $("#signOutBtn").hidden = !currentUser;
    const authBtn = $("#authOpenBtn");
    authBtn.textContent = currentUser ? "Sign Out" : "Sign In / Sign Up";
    const navUser = $("#navUser");
    navUser.hidden = !currentUser;
    navUser.textContent = currentUser ? "Hi, " + currentUser.name + "!" : "";
    $("#tutorNavLink").hidden = !currentUser;
    $("#tutor").hidden = !currentUser; // My Tutor section appears when signed in
    $("#flashcardsNavLink").hidden = !currentUser;
    $("#flashcards").hidden = !currentUser; // Flashcards section too (per-user words)
    if (currentUser) {
      const tier = DB && currentUser.plan ? DB.PLANS[currentUser.plan] : null;
      $("#signinMsg").textContent = "Angemeldet als " + currentUser.name +
        (tier ? " (" + tier.label + " " + tier.range + ")." : ".");
      $("#signinMsg").className = "form-msg ok";
      loadTutorHistory();
      syncTutorLevelFromUser(); // start each tutor session at the user's level
      if (Flash) {
        Flash.setSignedIn(currentUser);
        Flash.refresh(); // rebuild the user's flashcard deck
      }
    } else {
      tutorLoaded = false;
      userTopics = [];
      currentTopicId = null;
      topicSelect.innerHTML = '<option value="">— Wähle ein Thema (choose a topic) —</option>';
      if (Flash) Flash.setSignedIn(null); // clear the deck + show the signed-out hint
    }
  }

  function signOut() {
    currentUser = null;
    localStorage.removeItem("dl-user");
    refreshAuthState();
    closeAuth();
    formMsg($("#signinMsg"), "Signed out. Bis bald! 👋", true);
  }

  function showSuccess(title, text) {
    signupForm.hidden = true;
    signinForm.hidden = true;
    $$(".auth-tabs, .modal-close").forEach((el) => (el.hidden = false));
    successBox.hidden = false;
    $("#authSuccessTitle").textContent = title;
    $("#authSuccessText").textContent = text;
  }

  $("#authOpenBtn").addEventListener("click", () => {
    if (currentUser) {
      signOut();
    } else {
      openAuth("signup");
    }
  });
  $$(".plan-cta, [data-signup]").forEach((btn) =>
    btn.addEventListener("click", () => openAuth("signup"))
  );
  $("[data-signin]").addEventListener("click", () => openAuth("signin"));
  $("#authClose").addEventListener("click", closeAuth);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeAuth(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeAuth(); });

  $$(".auth-tab").forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.authTab)));

  /* Signup */
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = $("#signupMsg");
    if (!DB) { formMsg(msgEl, "Storage unavailable.", false); return; }
    try {
      const user = await DB.Users.create({
        name: $("#sgName").value,
        email: $("#sgEmail").value,
        password: $("#sgPass").value,
        plan: $("#sgPlan").value,
      });
      currentUser = user;
      localStorage.setItem("dl-user", JSON.stringify(user));
      // Copy the plan's topic pack onto the new user profile right away so
      // My Tutor immediately offers selectable topics.
      if (DB.UserTopics) await DB.UserTopics.ensure(user.email);
      const tier = DB.PLANS[user.plan];
      showSuccess(
        "Vollständig! 🎉",
        "Welcome to GutenTag, " + user.name + "! Your " + tier.label + " (" + tier.range + ") plan is set and your tutor will answer at German level " + user.tutorLevel + ". Check the Visit section for trial times!"
      );
      refreshAuthState();
    } catch (err) {
      formMsg(msgEl, err.message, false);
    }
  });

  /* Sign in */
  signinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = $("#signinMsg");
    if (!DB) { formMsg(msgEl, "Storage unavailable.", false); return; }
    try {
      currentUser = await DB.Users.authenticate($("#siEmail").value, $("#siPass").value);
      localStorage.setItem("dl-user", JSON.stringify(currentUser));
      showSuccess("Willkommen zurück! 👋", "Schön, dich wiederzusehen, " + currentUser.name + "! Ready to practice? Open the My Tutor section above. Viel Erfolg!");
      refreshAuthState(); // sync header button + nav immediately (was missing → header said "Sign In / Sign Up" and clicking it signed you out)
    } catch (err) {
      formMsg(msgEl, err.message, false);
    }
  });

  /* Sign out (modal button) */
  $("#signOutBtn").addEventListener("click", signOut);

  /* Restore session */
  try {
    const saved = localStorage.getItem("dl-user");
    if (saved) currentUser = JSON.parse(saved);
    if (currentUser) refreshAuthState();
  } catch (_) { /* ignore corrupt session */ }

  $("#authSuccessClose").addEventListener("click", closeAuth);

  /* ================================================================
     Service bot (Visit section) — via api/chat.js + DB persistence
     ================================================================ */
  const chatLog = $("#chatLog");
  const chatForm = $("#chatForm");
  const chatInput = $("#chatInput");
  let chatBusy = false;

  (async function restoreServiceChat() {
    if (!DB) return;
    const saved = await DB.ChatSessions.load("service");
    saved.forEach((m) => addBubble(chatLog, m.content ?? m.text, m.role));
    if (!saved.length) {
      addBubble(
        chatLog,
        "🥨 I'm Klaus. Ask me anything about GutenTag — lessons, prices, hours, or our team.",
        "bot"
      );
    }
  })();

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = chatInput.value.trim();
    if (!q || chatBusy) return;
    chatBusy = true;
    chatInput.value = "";

    addBubble(chatLog, q, "user");
    const typing = addTypingIndicator(chatLog);

    const history = Array.from(chatLog.querySelectorAll(".bubble:not(.bubble-error)"))
      .slice(0, -1)
      .map((b) => ({
        role: b.classList.contains("bubble-user") ? "user" : "assistant",
        content: b.textContent,
      }));

    const answer = await Chat.ask(q, history);
    typing.remove();
    addBubble(chatLog, answer.text, "bot");
    if (DB) DB.ChatSessions.save("service", history.concat({ role: "assistant", content: answer.text }).slice(-40));
    chatBusy = false;
    chatInput.focus();
  });

  /* Clear service-chat history */
  $("#chatClear").addEventListener("click", async () => {
    chatLog.innerHTML = "";
    addBubble(
      chatLog,
      "🥨 I'm Klaus. Ask me anything about GutenTag — lessons, prices, hours, or our team.",
      "bot"
    );
    if (DB) await DB.ChatSessions.clear("service");
    chatInput.focus();
  });

  /* ================================================================
     Tutor section (My Tutor) — via api/tutor.js; per-topic history lives
     on the user profile (DB.UserTopics), the no-topic chat is session-only
     ================================================================ */
  function loadTutorHistory() {
    if (tutorLoaded) return;
    tutorLoaded = true;
    tutorMessages = []; // fresh start — there is no general tutor table anymore
    tutorLog.innerHTML = "";
    addBubble(tutorLog, "Guten Tag! 🇩🇪 Ich bin Herr Grün, dein Deutschlehrer. Wie geht es dir heute?", "bot");
  }

  /* Start (or restore) a tutor session at the user's current level — which
     is seeded from their lesson plan at signup. There is no level picker in
     the UI; the displayed hint simply reflects the user's stored level. */
  async function syncTutorLevelFromUser() {
    if (!DB || !currentUser) return;
    const user = await DB.Users.findByEmail(currentUser.email);
    const level = user?.tutorLevel ?? currentUser.tutorLevel; // DB wins over the cached session
    if (!level) return;
    tutorLevel = level;
    /* Display the level the way the user picked it: the plan tier's CEFR
       range — A1–A2 (Beginner), A2–B1 (Intermediate), B1–C1 (Advanced) —
       falling back to the raw stored level when no plan is known. */
    const tier = DB.PLANS?.[user?.plan ?? currentUser.plan] ?? null;
    $("#tutorLevelLabel").textContent = tier ? tier.range + " (" + tier.label + ")" : level;
    await loadUserTopics();
  }

  /* Topics come from the copy of the plan's range pack stored on the user
     profile (see api/db.js → UserTopics). The select lists them with ✓ for      visited ones; the chip starts practicing the selected topic and the
     tutor messages for that topic are kept in its history. */
  function findTopic(id) {
    return userTopics.find((t) => Number(t.id) === Number(id)) || null;
  }

  function renderTopicSelect() {
    topicSelect.innerHTML = "";
    topicSelect.append(new Option("— Wähle ein Thema (choose a topic) —", ""));
    for (const t of userTopics) {
      const opt = new Option((t.visited ? "✓ " : "") + t.topic, String(t.id));
      opt.selected = Number(t.id) === Number(currentTopicId);
      topicSelect.append(opt);
    }
  }

  /* View-only starter bubble for a freshly chosen topic (not persisted). */
  function addTopicStarter(t) {
    addBubble(tutorLog, "🎯 " + t.topic + " — schreib deinen ersten Satz auf Deutsch, ich helfe dir! (write your first sentence in German, I'll help!)", "bot");
  }

  function markSelectComplete(id) {
    const opt = topicSelect.querySelector('option[value="' + id + '"]');
    if (opt && !opt.text.startsWith("✓ ")) opt.text = "✓ " + opt.text;
  }

  /* Render the conversation for the current selection: the selected topic's
     history, a fresh starter bubble when it's empty, or the general chat. */
  async function showTopicView() {
    const t = findTopic(currentTopicId);
    tutorLog.innerHTML = "";
    if (t) {
      (t.history || []).forEach((m) => addBubble(tutorLog, m.text, m.role));
      if (!t.history || !t.history.length) addTopicStarter(t);
    } else if (!tutorLoaded) {
      await loadTutorHistory(); // loads + renders the general session
    } else {
      tutorMessages.forEach((m) => addBubble(tutorLog, m.text, m.role));
      if (!tutorMessages.length) {
        addBubble(tutorLog, "Guten Tag! 🇩🇪 Ich bin Herr Grün, dein Deutschlehrer. Wie geht es dir heute?", "bot");
      }
    }
  }

  /* Load the user's own topic list (seeds legacy profiles on the way) and
     open the first incomplete topic by default. */
  async function loadUserTopics() {
    if (!DB || !currentUser) return;
    userTopics = (await DB.UserTopics.ensure(currentUser.email)) || [];
    if (!currentTopicId) {
      const next = userTopics.find((t) => !t.visited) || userTopics[0] || null;
      if (next) currentTopicId = next.id;
    }
    renderTopicSelect();
    await showTopicView();
  }

  tutorForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = tutorInput.value.trim();
    if (!q || tutorBusy) return;
    tutorBusy = true;
    tutorInput.value = "";

    addBubble(tutorLog, q, "user");
    const activeTopic = findTopic(currentTopicId);
    const prior = activeTopic ? (activeTopic.history || []) : tutorMessages;
    const typing = addTypingIndicator(tutorLog);

    const history = prior
      .map((m) => ({ role: m.role, content: m.text }));

    const answer = await Tutor.reply(q, tutorLevel, history, activeTopic ? activeTopic.topic : null);
    typing.remove();
    addBubble(tutorLog, answer.text, "bot");
    const turn = [
      { role: "user", text: q },
      { role: "assistant", text: answer.text },
    ];
    if (activeTopic && DB) {
      /* Persist onto the topic itself: history stays with the topic and the
         topic counts as practiced. */
      const updated = await DB.UserTopics.saveTurn(currentUser.email, activeTopic.id, turn);
      if (updated) {
        activeTopic.history = updated.history || [];
        activeTopic.visited = true;
      }
      markSelectComplete(activeTopic.id);
      /* Once the live ChatGPT tutor reply is in, harvest the misspelled
         German words from this turn into the user's flashcard deck
         (stored per user + topic; see api/db.js → Flashcards). Runs in
         the background — it must never hold up the chat. */
      if (Flash) {
        Flash.onTurn(currentUser.email, activeTopic.id, activeTopic.topic, {
          text: answer.text,
          source: answer.source,
          studentText: q,
          level: tutorLevel,
        }).catch((err) => console.warn("[flashcards] harvest failed:", err));
      }
    } else {
      tutorMessages.push({ role: "user", text: q });
      tutorMessages.push({ role: "assistant", text: answer.text });
      tutorMessages = tutorMessages.slice(-40);
    }
    tutorBusy = false;
    tutorInput.focus();
  });

  /* Insert a German special character into the composer at the cursor
     (or at the end when the field is not focused). These sit in the same
     .chip row as before, next to the Clear button. */
  function insertCharacter(char) {
    const start = tutorInput.selectionStart ?? tutorInput.value.length;
    const end = tutorInput.selectionEnd ?? start;
    tutorInput.value =
      tutorInput.value.slice(0, start) + char + tutorInput.value.slice(end);
    const nextPos = start + char.length;
    tutorInput.focus();
    tutorInput.setSelectionRange(nextPos, nextPos);
  }
  $$(".tutor-quickrow .chip-insert").forEach((chip) =>
    chip.addEventListener("click", () => insertCharacter(chip.dataset.insert))
  );

  /* Clear history: per-topic when a topic is selected, else the general chat */
  $("#tutorClear").addEventListener("click", async () => {
    const activeTopic = findTopic(currentTopicId);
    tutorLog.innerHTML = "";
    if (activeTopic && DB && currentUser) {
      const updated = await DB.UserTopics.clearHistory(currentUser.email, activeTopic.id);
      activeTopic.history = updated?.history ?? [];
      activeTopic.visited = updated ? updated.visited : activeTopic.visited; // clears to false
      renderTopicSelect(); // drop the ✓ from the option
      addTopicStarter(activeTopic);
    } else {
      tutorMessages = [];
      addBubble(tutorLog, "Guten Tag! 🇩🇪 Ich bin Herr Grün, dein Deutschlehrer. Wie geht es dir heute?", "bot");
    }
    tutorInput.focus();
  });

  /* Switching topics opens that topic's (saved) conversation */
  topicSelect.addEventListener("change", async () => {
    currentTopicId = topicSelect.value ? Number(topicSelect.value) : null;
    await showTopicView();
  });
})();
