/**
 * flashcards.js — GutenTag Flashcards section.
 *
 * A per-user flashcard deck harvested from tutor practice: every time a
 * live ChatGPT tutor reply comes back (main.js → GutenFlashcards.onTurn),
 * the misspelled German words from that turn are stored by user + topic
 * (js/db.js → GutenDB.Flashcards). This module then deals them randomly
 * in the Flashcards section and lets the learner mark a word inactive so
 * it drops out of the deck.
 *
 * Exposed as window.GutenFlashcards; wired to the DOM in index.html and
 * driven from main.js (auth changes + tutor turns).
 */
(function () {
  "use strict";

  const DB = () => window.GutenDB;
  const Tutor = () => window.GutenTutor;

  /* DOM (cached at init — index.html is loaded before this script) */
  let sectionEl, filterEl, cardEl, frontEl, backEl, statusEl;
  let emptyEl, nextBtn, shuffleBtn, toggleBtn, WordListEl, clearBtn;

  let user = null;          // signed-in user email (or null when signed out)
  let Topics = [];           // the user's topic list (for the filter)
  let topicFilter = "all";  // "all" | a topic id
  let deck = [];            // active cards, shuffled
  let index = -1;           // position in the (shuffled) deck
  let flipped = false;      // card currently showing its back?

  const $ = (sel) => document.querySelector(sel);

  function init() {
    sectionEl = $("#flashcards");
    filterEl = $("#flashTopicFilter");
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
    filterEl?.addEventListener("change", async () => {
      topicFilter = filterEl.value || "all";
      await buildDeck();
    });
    toggleBtn?.addEventListener("click", () => toggleActive());
    clearBtn?.addEventListener("click", () => clearAll());

    setSignedIn(null); // signed-out default until main.js says otherwise
  }

  /* -------------------------------------------------------------- */
  /* Auth state                                                      */
  /* -------------------------------------------------------------- */

  /* Signed out: clear state, collapse the deck. */
  function setSignedIn(currentUser) {
    user = currentUser ? currentUser.email : null;
    Topics = [];
    topicFilter = "all";
    if (filterEl) filterEl.innerHTML = '<option value="all">All topics</option>';
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

  /* Signed in (called on every auth change): refresh the deck. */
  async function refresh() {
    if (!user || !DB()) return;
    const topics = await DB().UserTopics.list(user);
    Topics = topics || [];
    renderTopicFilter();
    await buildDeck();
  }

  function renderTopicFilter() {
    if (!filterEl) return;
    filterEl.innerHTML = "";
    filterEl.append(new Option("All topics (" + Topics.length + ")", "all"));
    for (const t of Topics) {
      const opt = new Option(t.topic, String(t.id));
      opt.selected = filterValueMatches(t.id);
      filterEl.append(opt);
    }
    /* Keep "all" available even when a topic is selected (option order:
       filterEl.value falls back to the first option if unset). */
    if (filterEl.value !== (topicFilter === "all" ? "all" : String(topicFilter))) {
      filterEl.value = topicFilter === "all" ? "all" : String(topicFilter);
    }
  }

  function filterValueMatches(topicId) {
    return topicFilter !== "all" && Number(topicFilter) === Number(topicId);
  }

  /* -------------------------------------------------------------- */
  /* Harvesting: storage after each live tutor ChatGPT reply         */
  /* -------------------------------------------------------------- */

  /* main.js calls this after every tutor turn:
   *   email     — signed-in user
   *   topicId   — the practiced topic (null for topicless chat; skipped)
   *   topicName — the topic's label for display
   *   answer    — { text, source } from GutenTutor.reply
   * Words are harvested only when the reply came from live ChatGPT
   * ("chatgpt") — the practice-mode fallback has nothing to correct.    */
  async function onTurn(email, topicId, topicName, answer) {
    if (!email || !DB() || !Tutor()) return;
    if (!topicId || !answer || answer.source !== "chatgpt") return;

    try {
      const words = await Tutor().extractMisspellings(
        answer.studentText,
        answer.level || "A1",
        answer.text
      );
      if (!words.length) return;
      const added = await DB().Flashcards.addWords(email, topicId, topicName, words);
      if (added > 0) {
        if (user === email) await refresh();
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

  /* Rebuild the random deck from storage for the current filter.
   * Active cards only — inactive ones are out until re-activated.      */
  async function buildDeck() {
    if (!user || !DB()) return;
    const cards = await DB().Flashcards.list(user, {
      topicId: topicFilter === "all" ? null : topicFilter,
      activeOnly: true,
    });
    deck = shuffleInPlace(cards.slice());
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
    if (!card) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent =
          "No flashcards yet — chat with Herr Grün in My Tutor, and every misspelled word lands here for practice.";
      }
      if (statusEl) statusEl.textContent = "";
      if (toggleBtn) toggleBtn.hidden = true;
      if (clearBtn) clearBtn.hidden = !user;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    if (statusEl) {
      const topicLabel = card.topic ? card.topic : "General chat";
      statusEl.textContent =
        "Card " + (index + 1) + " / " + deck.length +
        "  •  " + topicLabel + "  •  click the card to flip it";
    }
    if (frontEl) frontEl.textContent = card.german;
    if (backEl) {
      backEl.textContent = card.english;
      const wrote = backEl.querySelector(".flash-wrong");
      if (wrote) wrote.remove();
      if (card.wrong && card.wrong.toLowerCase() !== String(card.german).toLowerCase()) {
        const wrongLine = document.createElement("span");
        wrongLine.className = "flash-wrong";
        wrongLine.textContent = "You wrote: " + card.wrong;
        backEl.appendChild(wrongLine);
      }
    }
    if (toggleBtn) {
      toggleBtn.hidden = false;
      toggleBtn.textContent = "Mark Inactive";
      toggleBtn.title = "Drop „" + card.german + "“ out of the practice deck";
    }
    if (clearBtn) clearBtn.hidden = false;
  }

  /* Mark the current card inactive (main requirement): it leaves the
   * random deck; it can be re-activated from the word list below.      */
  async function toggleActive() {
    const card = currentCard();
    if (!card || !user || !DB()) return;
    await DB().Flashcards.setActive(user, card.id, false);
    cardEl.classList.remove("is-flipped");
    flipped = false;
    deck.splice(index, 1); // out of the deck right away
    if (index >= deck.length) index = deck.length - 1; // still -1 when empty
    render();
    renderWordList();
  }

  /* Re-activate an inactive card from the word list. */
  async function activateCard(id) {
    if (!user || !DB()) return;
    await DB().Flashcards.setActive(user, id, true);
    await buildDeck();
  }

  /* Small list of every card in the current filter: active ones are in
   * the deck (click → deal that card), inactive ones have an Undo.     */
  async function renderWordList() {
    if (!WordListEl || !user || !DB()) return;
    const all = await DB().Flashcards.list(user, {
      topicId: topicFilter === "all" ? null : topicFilter,
    });
    WordListEl.innerHTML = "";
    if (!all.length) return;
    const title = document.createElement("h4");
    title.textContent =
      "Your words (" + all.filter((c) => c.active).length + " active / " + all.length + ")";
    WordListEl.appendChild(title);
    for (const card of all) {
      const chip = document.createElement("span");
      chip.className = "chip flash-chip" + (card.active ? "" : " flash-chip-inactive");
      if (card.active) {
        chip.textContent = card.german;
        chip.title = card.english + (card.wrong ? " (wrote: " + card.wrong + ")" : "");
        chip.addEventListener("click", () => {
          // deal this card next: rebuild deck from storage first
          activateCardThenShow(card.id);
        });
      } else {
        chip.textContent = card.german + " ⛔";
        chip.title = "Inactive — click to put it back in the deck";
        chip.addEventListener("click", () => activateCard(card.id));
      }
      WordListEl.appendChild(chip);
    }
  }

  /* From the word list: make sure the card is in the deck, then show it. */
  async function activateCardThenShow(id) {
    await activateCard(id);
    const at = deck.findIndex((c) => c.id === id);
    if (at >= 0) {
      index = at;
      flipped = false;
      render();
    }
  }

  /* Wipe the whole per-user collection (optionally one topic). */
  async function clearAll() {
    if (!user || !DB()) return;
    await DB().Flashcards.clear(user, topicFilter === "all" ? null : topicFilter);
    await buildDeck();
  }

  /* -------------------------------------------------------------- */

  window.GutenFlashcards = {
    init,
    onTurn,
    setSignedIn,
    refresh,
  };
})();
