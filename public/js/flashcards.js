/**
 * flashcards.js — GutenTag Flashcards (a tab inside My Tutor).
 *
 * A per-user flashcard deck harvested from tutor practice, stored UNDER
 * EACH TOPIC on the user profile (js/db.js → Flashcards; the words live
 * in users.topics[].flashcards in IndexedDB, right next to the topic's
 * chat history). Every misspelled word carries a `misses` count that
 * grows each time the student misspells it again for that topic.
 *
 * The deck shown here is ALWAYS the currently selected topic — the same
 * shared topic dropdown that drives the Chat tab (main.js tells this
 * module which topic is selected via GutenFlashcards.setTopic). When a
 * live ChatGPT tutor reply comes back (main.js → GutenFlashcards.onTurn),
 * the misspelled German words from that turn are counted and stored under
 * that topic, and the tutor gets the worst-offending words passed into
 * its prompt for reinforcement (js/tutor.js → GutenTutor.reply).
 *
 * Exposed as window.GutenFlashcards; wired to the DOM in index.html and
 * driven from main.js (auth changes + topic changes + tutor turns).
 */
(function () {
  "use strict";

  const DB = () => window.GutenDB;
  const Tutor = () => window.GutenTutor;

  /* DOM (cached at init — index.html is loaded before this script) */
  let cardEl, frontEl, backEl, statusEl;
  let emptyEl, nextBtn, shuffleBtn, toggleBtn, WordListEl, clearBtn;

  let user = null;           // signed-in user email (or null when signed out)
  let topicId = null;        // the topic selected in the shared dropdown (null = none)
  let topicName = "";        // its label, from the dropdown option
  let deck = [];             // cards of the selected topic, shuffled
  let index = -1;            // position in the (shuffled) deck
  let flipped = false;       // card currently showing its back?

  const $ = (sel) => document.querySelector(sel);

  function init() {
    cardEl = $("#flashCard");
    frontEl = $("#flashCardFront");
    backEl = $("#flashCardBack");
    statusEl = $("#flashStatus");
    emptyEl = $("#flashEmpty");
    WordListEl = $("#flashWordList");
    nextBtn = $("#flashNext");
    shuffleBtn = $("#flashShuffle");
    toggleBtn = $("#flashToggleActive");
    clearBtn = $("#flashClear");

    nextBtn?.addEventListener("click", () => nextCard());
    shuffleBtn?.addEventListener("click", () => buildDeck());
    cardEl?.addEventListener("click", () => {
      if (deck[index]) {
        flipped = !flipped;
        cardEl.classList.toggle("is-flipped", flipped);
      }
    });
    toggleBtn?.addEventListener("click", () => toggleActive());
    clearBtn?.addEventListener("click", () => clearTopic());

    setSignedIn(null); // signed-out default until main.js says otherwise
  }

  /* -------------------------------------------------------------- */
  /* Auth + topic state                                              */
  /* -------------------------------------------------------------- */

  /* Signed out: clear state, collapse the deck. */
  function setSignedIn(currentUser) {
    user = currentUser ? currentUser.email : null;
    topicId = null;
    topicName = "";
    deck = [];
    index = -1;
    if (WordListEl) WordListEl.innerHTML = "";
    if (!user) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = "Sign in to collect flashcards from your tutor practice. 🥨";
      }
      if (statusEl) statusEl.textContent = "";
      if (cardEl) cardEl.hidden = true;
      if (toggleBtn) toggleBtn.hidden = true;
      if (clearBtn) clearBtn.hidden = true;
    }
  }

  /* main.js calls this whenever the shared My Tutor topic dropdown
   * changes (and after the user's topics have loaded): this deck only
   * ever shows the words stored under the SELECTED topic.               */
  function setTopic(selected) {
    if (!user) return;
    topicId = selected == null || selected === "" ? null : Number(selected);
    topicName = "";
    if (topicId != null) {
      const opt = $("#tutorTopicSelect")?.querySelector(
        'option[value="' + topicId + '"]'
      );
      if (opt) topicName = opt.textContent.replace(/^✓\s*/, "");
    }
    buildDeck();
  }

  /* Signed in (called on every auth change): refresh the current topic's deck. */
  async function refresh() {
    if (!user || !DB()) return;
    await Deck();
  }

  /* -------------------------------------------------------------- */
  /* Harvesting: storage after each live tutor ChatGPT reply         */
  /* -------------------------------------------------------------- */

  /* main.js calls this after every tutor turn:
   *   email     — signed-in user
   *   practicedTopicId — the practiced topic (null for topicless chat;
   *               skipped — flashcards only exist under topics)
   *   topicName — the topic's label
   *   answer    — { text, source } from GutenTutor.reply
   * Words are harvested only when the reply came from live ChatGPT
   * ("chatgpt") — the practice-mode fallback has nothing to correct.
   * Each stored card keeps a `misses` count; a repeat miss bumps it.    */
  async function onTurn(email, practicedTopicId, topicName, answer) {
    if (!email || !DB() || !Tutor()) return;
    if (!practicedTopicId || !answer || answer.source !== "chatgpt") return;

    try {
      const words = await Tutor().extractMisspellings(
        answer.studentText,
        answer.level || "A1",
        answer.text
      );
      if (!words.length) return;
      await DB().Flashcards.addWords(email, practicedTopicId, words);
      /* Miss counts grow even when the card already existed, so refresh
       * the visible deck whenever the practiced topic is the one
       * currently selected — new words and bumped counts show up live.   */
      if (user === email && practicedTopicId != null &&
          Number(practicedTopicId) === Number(topicId)) {
        await buildDeck();
      }
    } catch (err) {
      console.warn("[flashcards] harvesting skipped:", err?.message || err);
    }
  }

  /* -------------------------------------------------------------- */
  /* Deck building + display                                         */
  /* -------------------------------------------------------------- */

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* Rebuild the random deck from storage for the selected topic.
   * Active cards only — inactive ones are out until re-activated.
   * When no topic is selected, the deck is empty by definition, because
   * flashcards live under topics now.                                   */
  async function buildDeck() {
    if (!user || !DB()) return;
    if (topicId == null) {
      deck = [];
      index = -1;
      flipped = false;
      render();
      renderWordList();
      return;
    }
    const cards = await DB().Flashcards.list(user, topicId);
    deck = shuffleInPlace(cards.filter((c) => c.active));
    index = deck.length ? 0 : -1;
    flipped = false;
    render();
    renderWordList();
  }

  function nextCard() {
    if (!deck.length) return;
    index = (index + 1) % deck.length;
    flipped = false;
    cardEl.classList.remove("is-flipped");
    render();
  }

  function currentCard() {
    return index >= 0 ? deck[index] : null;
  }

  async function render() {
    if (!cardEl) return;
    const card = currentCard();
    cardEl.hidden = !card;
    cardEl.classList.toggle("is-flipped", flipped);
    const label = topicName || (topicId != null ? "this topic" : "");
    if (!card) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = topicId == null
          ? "Choose a topic above (the same dropdown that drives the Chat tab) to see its flashcards. 🥨"
          : "No flashcards for „" + label + "“ yet — chat with Herr Grün in the Chat tab while practicing this topic, and every misspelled word lands here for practice.";
      }
      if (statusEl) statusEl.textContent = "";
      if (toggleBtn) toggleBtn.hidden = true;
      if (clearBtn) clearBtn.hidden = !(user && topicId != null);
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    if (statusEl) {
      statusEl.textContent =
        "Card " + (index + 1) + " / " + deck.length +
        (card.misses > 1 ? "  •  missed " + card.misses + "×" : "") +
        "  •  click the card to flip it";
    }
    if (frontEl) frontEl.textContent = card.german;
    if (backEl) {
      backEl.textContent = card.english;
      const wrote = backEl.querySelector(".flash-wrong");
      if (wrote) wrote.remove();
      if (card.wrong && card.wrong.toLowerCase() !== String(card.german).toLowerCase()) {
        const wrongLine = document.createElement("span");
        wrongLine.className = "flash-wrong";
        wrongLine.textContent =
          "You wrote: " + card.wrong +
          (card.misses > 1 ? " (" + card.misses + " misses)" : "");
        backEl.appendChild(wrongLine);
      }
    }
    if (toggleBtn) {
      toggleBtn.hidden = false;
      toggleBtn.textContent = "Mark Inactive";
      toggleBtn.title = "Drop „" + card.german + "“ out of this topic's practice deck";
    }
    if (clearBtn) clearBtn.hidden = false;
  }

  /* Mark the current card inactive: it leaves the topic's deck; it can
   * be re-activated from the word list below.                           */
  async function toggleActive() {
    const card = currentCard();
    if (!card || !user || !DB() || topicId == null) return;
    await DB().Flashcards.setActive(user, topicId, card.german, false);
    cardEl.classList.remove("is-flipped");
    flipped = false;
    deck.splice(index, 1); // out of the deck right away
    if (index >= deck.length) index = deck.length - 1; // still -1 when empty
    render();
    renderWordList();
  }

  /* Re-activate an inactive card from the word list. */
  async function activateCard(german) {
    if (!user || !DB() || topicId == null) return;
    await DB().Flashcards.setActive(user, topicId, german, true);
    await buildDeck();
  }

  /* List of every card under the selected topic, worst offenders first:
   * active ones are in the deck (click → deal that card), inactive ones
   * have an Undo. The miss count is shown on each chip.                 */
  async function renderWordList() {
    if (!WordListEl || !user || !DB()) return;
    WordListEl.innerHTML = "";
    if (topicId == null) return;
    const all = await DB().Flashcards.list(user, topicId);
    if (!all.length) return;
    const sorted = all.slice().sort((a, b) => (b.misses || 1) - (a.misses || 1));
    for (const card of sorted) {
      const chip = document.createElement("span");
      chip.className = "chip flash-chip" + (card.active ? "" : " flash-chip-inactive");
      const count = card.misses > 1 ? " ×" + card.misses : "";
      if (card.active) {
        chip.textContent = card.german + count;
        chip.title =
          card.english +
          (card.wrong ? " (wrote: " + card.wrong + ")" : "") +
          (card.misses > 1 ? " — misspelled " + card.misses + " times" : "");
        chip.addEventListener("click", () => {
          // deal this card next: rebuild deck from storage first
          activateCardThenShow(card.german);
        });
      } else {
        chip.textContent = card.german + count + " ⛔";
        chip.title = "Inactive — click to put it back in the deck";
        chip.addEventListener("click", () => activateCard(card.german));
      }
      WordListEl.appendChild(chip);
    }
  }

  /* From the word list: make sure the card is in the deck, then show it. */
  async function activateCardThenShow(german) {
    await activateCard(german);
    const at = deck.findIndex((c) => c.german === german);
    if (at >= 0) {
      index = at;
      flipped = false;
      render();
    }
  }

  /* Wipe the flashcards stored under the SELECTED topic (the dedicated
   * Clear button sits in the Flashcards tab, separate from the Chat
   * tab's Clear button which only wipes the topic's chat history).      */
  async function clearTopic() {
    if (!user || !DB() || topicId == null) return;
    const n = await DB().Flashcards.clear(user, topicId);
    await buildDeck();
    if (statusEl) {
      statusEl.textContent =
        "Cleared " + n + " flashcard" + (n === 1 ? "" : "s") +
        (topicName ? " for „" + topicName + "“" : "") + ".";
    }
  }

  /* -------------------------------------------------------------- */

  window.GutenFlashcards = {
    init,
    onTurn,
    setSignedIn,
    setTopic,
    refresh,
  };
})();
