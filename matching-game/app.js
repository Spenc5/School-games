(() => {
  'use strict';

  // A large pool of distinct emoji symbols; we only use as many pairs as the
  // chosen difficulty needs.
  const SYMBOL_POOL = [
    '🍎', '🍌', '🍇', '🍉', '🍓', '🍒', '🍋', '🍑',
    '🐶', '🐱', '🐸', '🐵', '🦁', '🐢', '🦋', '🐙',
    '⚽', '🏀', '🎈', '🎲', '🚗', '✈️', '🌈', '⭐',
  ];

  const boardEl = document.getElementById('board');
  const turnTextEl = document.getElementById('turnText');
  const scoreP1Wrap = document.getElementById('scoreP1Wrap');
  const scoreP2Wrap = document.getElementById('scoreP2Wrap');
  const scoreP1El = document.getElementById('scoreP1');
  const scoreP2El = document.getElementById('scoreP2');

  const btnNewGame = document.getElementById('btnNewGame');
  const btnHelp = document.getElementById('btnHelp');
  const btnCloseHelp = document.getElementById('btnCloseHelp');
  const btnPlayAgain = document.getElementById('btnPlayAgain');
  const selDifficulty = document.getElementById('selDifficulty');

  const gameOverModal = document.getElementById('gameOverModal');
  const gameOverTitleEl = document.getElementById('gameOverTitle');
  const gameOverDetailEl = document.getElementById('gameOverDetail');
  const helpModal = document.getElementById('helpModal');

  const MISMATCH_DELAY_MS = 900;

  // -- State ---------------------------------------------------------------
  let cards = []; // { symbol, matched }
  let flippedIndices = []; // currently face-up, unresolved (max 2)
  let currentPlayer = 1;
  let scores = { 1: 0, 2: 0 };
  let locked = false; // true while resolving a mismatch/match pause

  // -- Setup -----------------------------------------------------------

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildDeck(cardCount) {
    const pairCount = cardCount / 2;
    const symbols = shuffle(SYMBOL_POOL).slice(0, pairCount);
    const deck = shuffle([...symbols, ...symbols]).map((symbol) => ({
      symbol,
      matched: false,
    }));
    return deck;
  }

  function newGame() {
    const cardCount = parseInt(selDifficulty.value, 10);
    cards = buildDeck(cardCount);
    flippedIndices = [];
    currentPlayer = 1;
    scores = { 1: 0, 2: 0 };
    locked = false;
    hideModal(gameOverModal);
    render();
  }

  // -- Rendering ---------------------------------------------------------

  function render() {
    renderBoard();
    renderBanner();
  }

  function renderBoard() {
    boardEl.style.gridTemplateColumns = cards.length > 16 ? 'repeat(6, 1fr)' : 'repeat(4, 1fr)';
    boardEl.innerHTML = '';

    cards.forEach((card, index) => {
      const cardEl = document.createElement('div');
      const isFaceUp = card.matched || flippedIndices.includes(index);
      cardEl.className = `card${isFaceUp ? ' flipped' : ''}${card.matched ? ' matched' : ''}`;
      cardEl.setAttribute('role', 'gridcell');
      cardEl.tabIndex = 0;
      cardEl.setAttribute('aria-label', isFaceUp ? `Card: ${card.symbol}` : 'Face-down card');

      const inner = document.createElement('div');
      inner.className = 'card-inner';

      const back = document.createElement('div');
      back.className = 'card-face card-back';

      const front = document.createElement('div');
      front.className = 'card-face card-front';
      front.textContent = card.symbol;

      inner.appendChild(back);
      inner.appendChild(front);
      cardEl.appendChild(inner);

      cardEl.addEventListener('click', () => onCardClick(index));
      cardEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCardClick(index);
        }
      });

      boardEl.appendChild(cardEl);
    });
  }

  function renderBanner() {
    scoreP1El.textContent = scores[1];
    scoreP2El.textContent = scores[2];
    scoreP1Wrap.classList.toggle('active', currentPlayer === 1);
    scoreP2Wrap.classList.toggle('active', currentPlayer === 2);
    turnTextEl.textContent = `Player ${currentPlayer}'s turn`;
  }

  // -- Interaction -----------------------------------------------------

  function onCardClick(index) {
    if (locked) return;
    const card = cards[index];
    if (card.matched) return;
    if (flippedIndices.includes(index)) return;
    if (flippedIndices.length >= 2) return;

    flippedIndices.push(index);
    render();

    if (flippedIndices.length === 2) {
      resolveTurn();
    }
  }

  function resolveTurn() {
    locked = true;
    const [i, j] = flippedIndices;
    const isMatch = cards[i].symbol === cards[j].symbol;

    setTimeout(() => {
      if (isMatch) {
        cards[i].matched = true;
        cards[j].matched = true;
        scores[currentPlayer] += 1;
        flippedIndices = [];
        locked = false;
        render();
        if (cards.every((c) => c.matched)) {
          endGame();
        }
      } else {
        flippedIndices = [];
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        locked = false;
        render();
      }
    }, isMatch ? 350 : MISMATCH_DELAY_MS);
  }

  // -- Game over ---------------------------------------------------------

  function endGame() {
    let title = "It's a tie!";
    let detail = `Both players found ${scores[1]} pairs.`;

    if (scores[1] !== scores[2]) {
      const winner = scores[1] > scores[2] ? 1 : 2;
      title = `Player ${winner} wins!`;
      detail = `Player ${winner} found ${scores[winner]} pairs to ${scores[winner === 1 ? 2 : 1]}.`;
    }

    gameOverTitleEl.textContent = title;
    gameOverDetailEl.textContent = detail;
    showModal(gameOverModal);
  }

  // -- Modals --------------------------------------------------------

  function showModal(el) {
    el.hidden = false;
  }

  function hideModal(el) {
    el.hidden = true;
  }

  // -- Wire up events --------------------------------------------------

  btnNewGame.addEventListener('click', newGame);
  btnPlayAgain.addEventListener('click', newGame);
  btnHelp.addEventListener('click', () => showModal(helpModal));
  btnCloseHelp.addEventListener('click', () => hideModal(helpModal));
  selDifficulty.addEventListener('change', newGame);

  for (const overlay of [helpModal, gameOverModal]) {
    overlay.addEventListener('click', (e) => {
      if (e.target !== overlay) return;
      if (overlay !== gameOverModal) hideModal(overlay);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!helpModal.hidden) hideModal(helpModal);
  });

  // -- Init --------------------------------------------------------------
  newGame();
})();
