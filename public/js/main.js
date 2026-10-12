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
    if (currentUser) {
      $("#signinMsg").textContent = "Angemeldet als " + currentUser.name + " (" + currentUser.plan + ").";
      $("#signinMsg").className = "form-msg ok";
    }
  }

  function showSuccess(title, text) {
    signupForm.hidden = true;
    signinForm.hidden = true;
    $$(".auth-tabs, .modal-close").forEach((el) => (el.hidden = false));
    successBox.hidden = false;
    $("#authSuccessTitle").textContent = title;
    $("#authSuccessText").textContent = text;
  }

  $("#authOpenBtn").addEventListener("click", () => openAuth(currentUser ? "signin" : "signup"));
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
      showSuccess(
        "Vollständig! 🎉",
        "Welcome to GutenTag, " + user.name + "! Your " + user.plan + " package is reserved. Check the Visit section for trial times — and don't forget your AI tutor (bottom right!)."
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
      showSuccess("Willkommen zurück! 👋", "Schön, dich wiederzusehen, " + currentUser.name + "! Ready to practice? Tap „My Tutor\" below. Viel Erfolg!");
    } catch (err) {
      formMsg(msgEl, err.message, false);
    }
  });

  /* Sign out */
  $("#signOutBtn").addEventListener("click", () => {
    currentUser = null;
    localStorage.removeItem("dl-user");
    refreshAuthState();
    formMsg($("#signinMsg"), "Signed out. Bis bald! 👋", true);
  });

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
     Tutor panel (floating) — via api/tutor.js + DB persistence
     ================================================================ */
  const panel = $("#tutorPanel");
  const tutorLog = $("#tutorLog");
  const tutorForm = $("#tutorForm");
  const tutorInput = $("#tutorInput");
  const levelSelect = $("#tutorLevel");
  let tutorBusy = false;
  let tutorMessages = [];

  $("#tutorFab").addEventListener("click", async () => {
    panel.hidden = false;
    $("#tutorFab").style.display = "none";
    if (!DB) return;
    tutorMessages = await DB.TutorSessions.load("tutor");
    tutorLog.innerHTML = "";
    tutorMessages.forEach((m) => addBubble(tutorLog, m.text, m.role));
    if (!tutorMessages.length) {
      addBubble(tutorLog, "Guten Tag! 🇩🇪 Ich bin Herr Grün, dein Deutschlehrer. Wie geht es dir heute?", "bot");
    }
  });

  $("#tutorClose").addEventListener("click", () => {
    panel.hidden = true;
    $("#tutorFab").style.display = "";
  });

  levelSelect.addEventListener("change", async () => {
    const level = levelSelect.value;
    $("#tutorLevelLabel").textContent = level;
    if (DB) DB.Settings.set("tutorLevel", level);
  });

  (async function restoreTutorLevel() {
    if (!DB) return;
    const level = await DB.Settings.get("tutorLevel");
    if (level) {
      levelSelect.value = level;
      $("#tutorLevelLabel").textContent = level;
    }
  })();

  tutorForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = tutorInput.value.trim();
    if (!q || tutorBusy) return;
    tutorBusy = true;
    tutorInput.value = "";

    addBubble(tutorLog, q, "user");
    tutorMessages.push({ role: "user", text: q });
    const typing = addTypingIndicator(tutorLog);

    const history = tutorMessages.map((m) => ({ role: m.role, content: m.text }));

    const answer = await Tutor.reply(q, levelSelect.value, history.slice(0, -1));
    typing.remove();
    addBubble(tutorLog, answer.text, "bot");
    tutorMessages.push({ role: "assistant", text: answer.text });
    tutorMessages = tutorMessages.slice(-40);
    if (DB) DB.TutorSessions.save("tutor", tutorMessages);
    tutorBusy = false;
    tutorInput.focus();
  });

  /* Quick phrases */
  $$(".tutor-panel .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      if (chip.classList.contains("chip-clear")) return; // handled separately
      tutorInput.value = chip.dataset.quick;
      tutorForm.requestSubmit();
    })
  );

  /* Clear tutor history */
  $("#tutorClear").addEventListener("click", async () => {
    tutorLog.innerHTML = "";
    tutorMessages = [];
    addBubble(tutorLog, "Guten Tag! 🇩🇪 Ich bin Herr Grün, dein Deutschlehrer. Wie geht es dir heute?", "bot");
    if (DB) await DB.TutorSessions.clear("tutor");
    tutorInput.focus();
  });
})();
