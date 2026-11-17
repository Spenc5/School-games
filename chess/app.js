(() => {
  'use strict';

  const game = new window.Chess();

  /*
   * Pieces are drawn as SVG rather than set in Unicode chess characters.
   * Those characters can't be relied on to show the two sides differently:
   * fonts disagree about which are filled vs. outlined, and U+265F (pawn) is
   * also an emoji, so systems with a color-emoji font draw it from that font
   * and ignore any CSS color or outline — leaving both pawns identical.
   * Shapes take their colors from .piece-white / .piece-black in the CSS.
   */
  const PIECE_SVG = {
    p: `<circle cx="22.5" cy="13" r="5.2"/>
        <path d="M17.8 19.5h9.4c1.6 1.3 2.6 3.1 2.6 5.1 0 1.9-.9 3.6-2.3 4.8 2.9 1.9 4.9 4.6 5.4 8.1H12.1c.5-3.5 2.5-6.2 5.4-8.1-1.4-1.2-2.3-2.9-2.3-4.8 0-2 1-3.8 2.6-5.1z"/>
        <rect x="10" y="36.5" width="25" height="5.5" rx="2.5"/>`,
    r: `<path d="M11 8h5v3h4.5V8h4v3H29V8h5v8l-2.5 2.5v13L34 34v3H11v-3l2.5-2.5v-13L11 16z"/>
        <rect x="8.5" y="36" width="28" height="6" rx="2.5"/>`,
    n: `<path d="M31 37c0-7 .5-12-2-17l-3-4 1.5-6-3.5 3-2-4c-3 2-7 5-9 9l-3.5 5c-.5 2 1 3.5 3 3l2-1.5c.5 2.5-.5 4-1.5 5.5-1.5 2-2 4.5-2 7z"/>
        <rect x="9" y="36" width="27" height="6" rx="2.5"/>`,
    b: `<circle cx="22.5" cy="7" r="2.3"/>
        <path d="M22.5 10C27.5 13.5 32 18.5 32 24C32 27 30 29.2 27.5 30H17.5C15 29.2 13 27 13 24C13 18.5 17.5 13.5 22.5 10Z"/>
        <line x1="19.5" y1="15.5" x2="25.5" y2="21.5"/>
        <rect x="12.5" y="29.8" width="20" height="4.2" rx="2"/>
        <rect x="8.5" y="35.5" width="28" height="6.5" rx="2.5"/>`,
    q: `<circle cx="7.5" cy="13" r="2.4"/><circle cx="15" cy="9.5" r="2.4"/>
        <circle cx="22.5" cy="8" r="2.6"/>
        <circle cx="30" cy="9.5" r="2.4"/><circle cx="37.5" cy="13" r="2.4"/>
        <path d="M9 16L12.5 29H32.5L36 16L30.5 23L28 12L22.5 24L17 12L14.5 23Z"/>
        <rect x="11" y="28.5" width="23" height="4.5" rx="2"/>
        <rect x="8" y="34.5" width="29" height="7" rx="2.5"/>`,
    k: `<path d="M21 6h3v3h3v3h-3v3h-3v-3h-3V9h3z"/>
        <path d="M22.5 15c-6 0-11 4-11 9 0 2 .8 3.8 2 5h18c1.2-1.2 2-3 2-5 0-5-5-9-11-9z"/>
        <rect x="11" y="28.5" width="23" height="4.5" rx="2"/>
        <rect x="8" y="34.5" width="29" height="7" rx="2.5"/>`,
  };

  const PIECE_LABELS = { k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn' };

  function createPieceEl(color, type, className) {
    const holder = document.createElement('div');
    const label = `${color === 'w' ? 'White' : 'Black'} ${PIECE_LABELS[type]}`;
    holder.innerHTML =
      `<svg viewBox="0 0 45 45" class="${className} ${color === 'w' ? 'piece-white' : 'piece-black'}"` +
      ` role="img" aria-label="${label}">${PIECE_SVG[type]}</svg>`;
    return holder.firstElementChild;
  }

  const PIECE_VALUE_ORDER = ['q', 'r', 'b', 'n', 'p'];
  const PIECE_NAMES = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };

  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  // -- DOM refs --------------------------------------------------------
  const boardEl = document.getElementById('board');
  const turnBannerEl = document.getElementById('turnBanner');
  const turnTextEl = document.getElementById('turnText');
  const turnSwatchEl = document.getElementById('turnSwatch');
  const moveListEl = document.getElementById('moveList');
  const capturedTopEl = document.getElementById('capturedTop');
  const capturedBottomEl = document.getElementById('capturedBottom');
  const statusBlockEl = document.getElementById('statusBlock');
  const statusTextEl = document.getElementById('statusText');
  const selectionLabelEl = document.getElementById('selectionLabel');

  const btnNewGame = document.getElementById('btnNewGame');
  const btnUndo = document.getElementById('btnUndo');
  const btnFlip = document.getElementById('btnFlip');
  const btnHelp = document.getElementById('btnHelp');
  const btnCloseHelp = document.getElementById('btnCloseHelp');
  const btnPlayAgain = document.getElementById('btnPlayAgain');

  const chkAutoFlip = document.getElementById('chkAutoFlip');
  const chkLegalHints = document.getElementById('chkLegalHints');
  const selOpponent = document.getElementById('selOpponent');

  const promoModal = document.getElementById('promoModal');
  const promoChoicesEl = document.getElementById('promoChoices');
  const gameOverModal = document.getElementById('gameOverModal');
  const gameOverTitleEl = document.getElementById('gameOverTitle');
  const gameOverDetailEl = document.getElementById('gameOverDetail');
  const helpModal = document.getElementById('helpModal');

  // -- State -------------------------------------------------------------
  const COMPUTER_COLOR = 'b';
  const COMPUTER_LEVELS = {
    easy: { depth: 1, jitter: 120 },
    medium: { depth: 2, jitter: 40 },
    hard: { depth: 3, jitter: 0 },
  };
  // Paced so a student can follow what the computer is doing: long enough to
  // read the "thinking" banner and watch the reply slide into place.
  const THINKING_DELAY_MS = 1100;
  const MOVE_ANIMATION_MS = 420;

  let boardFlipped = false;
  let selectedSquare = null;
  let legalTargets = []; // verbose move objects for the currently selected square
  let lastMove = null; // { from, to }
  let pendingPromotion = null; // { from, to }
  let thinkingTimer = null; // pending computer move, if any
  let labeledPiece = null; // last piece clicked, named in the banner

  // -- Rendering -----------------------------------------------------

  function squareRenderOrder() {
    const ranks = boardFlipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
    const files = boardFlipped ? [...FILES].reverse() : FILES;
    const order = [];
    for (const r of ranks) {
      for (const f of files) order.push(`${f}${r}`);
    }
    return order;
  }

  function targetsForSquare(square) {
    return legalTargets.filter((m) => m.to === square);
  }

  function render() {
    renderBoard();
    renderTurnBanner();
    renderSelectionLabel();
    renderMoveList();
    renderCaptured();
  }

  function renderSelectionLabel() {
    selectionLabelEl.innerHTML = '';
    if (!labeledPiece) return;

    selectionLabelEl.appendChild(createPieceEl(labeledPiece.color, labeledPiece.type, 'label-piece'));
    const name = document.createElement('span');
    name.textContent = `${labeledPiece.color === 'w' ? 'White' : 'Black'} ${PIECE_LABELS[labeledPiece.type]}`;
    selectionLabelEl.appendChild(name);
  }

  /*
   * Slide pieces from where they were to where they now are. render() rebuilds
   * the board, so this runs after it: each moved piece starts offset by the
   * distance it travelled and transitions back to zero.
   */
  function animateSlides(slides) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

    let animating = false;
    for (const { from, to } of slides) {
      const fromEl = boardEl.querySelector(`[data-square="${from}"]`);
      const toEl = boardEl.querySelector(`[data-square="${to}"]`);
      const pieceEl = toEl && toEl.querySelector('.piece');
      if (!fromEl || !toEl || !pieceEl) continue;

      const dx = fromEl.offsetLeft - toEl.offsetLeft;
      const dy = fromEl.offsetTop - toEl.offsetTop;
      if (!dx && !dy) continue;

      toEl.classList.add('animating'); // lift it above neighbouring squares
      pieceEl.style.transition = 'none';
      pieceEl.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        pieceEl.style.transition = `transform ${MOVE_ANIMATION_MS}ms ease-out`;
        pieceEl.style.transform = 'translate(0, 0)';
      });
      animating = true;
    }
    return animating;
  }

  // A castle moves the rook too, so it needs to slide alongside the king.
  function slidesForMove(move) {
    const slides = [{ from: move.from, to: move.to }];
    const rank = move.color === 'w' ? '1' : '8';
    if (move.flags.includes('k')) slides.push({ from: `h${rank}`, to: `f${rank}` });
    if (move.flags.includes('q')) slides.push({ from: `a${rank}`, to: `d${rank}` });
    return slides;
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    const kingInCheckSquare = getCheckedKingSquare();
    const order = squareRenderOrder();

    for (const square of order) {
      const squareEl = document.createElement('div');
      const color = game.squareColor(square); // 'light' | 'dark'
      squareEl.className = `square ${color}`;
      squareEl.dataset.square = square;
      squareEl.setAttribute('role', 'gridcell');
      squareEl.tabIndex = -1;

      const piece = game.get(square);
      if (piece) {
        squareEl.appendChild(createPieceEl(piece.color, piece.type, 'piece'));
      }

      if (selectedSquare === square) squareEl.classList.add('selected');
      if (lastMove && (lastMove.from === square || lastMove.to === square)) {
        squareEl.classList.add('last-move');
      }
      if (kingInCheckSquare === square) squareEl.classList.add('in-check');

      if (chkLegalHints.checked) {
        const matches = targetsForSquare(square);
        if (matches.length) {
          const isCapture = matches.some((m) => m.captured || (m.flags && m.flags.includes('e')));
          squareEl.classList.add(isCapture ? 'hint-capture' : 'hint-empty');
        }
      }

      squareEl.addEventListener('click', () => onSquareClick(square));
      boardEl.appendChild(squareEl);
    }
  }

  function getCheckedKingSquare() {
    if (!game.isCheck()) return null;
    const turn = game.turn();
    for (const row of game.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === turn) return cell.square;
      }
    }
    return null;
  }

  function renderTurnBanner() {
    const turn = game.turn();
    const isOver = game.isGameOver();

    turnSwatchEl.className = `turn-swatch ${turn === 'w' ? 'white' : 'black'}`;

    if (isOver) {
      turnTextEl.textContent = 'Game over';
    } else if (isComputerTurn()) {
      turnTextEl.textContent = 'Computer is thinking…';
    } else {
      turnTextEl.textContent = `${turn === 'w' ? 'White' : 'Black'} to move${game.isCheck() ? ' — Check!' : ''}`;
    }

    turnBannerEl.classList.toggle('check', game.isCheck() && !isOver);
  }

  function renderMoveList() {
    const hist = game.history();
    moveListEl.innerHTML = '';
    for (let i = 0; i < hist.length; i += 2) {
      const li = document.createElement('li');
      const num = i / 2 + 1;
      const white = hist[i];
      const black = hist[i + 1];
      li.textContent = black ? `${white}   ${black}` : white;
      moveListEl.appendChild(li);
    }
    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  function renderCaptured() {
    const verboseHist = game.history({ verbose: true });
    const capturedByWhite = []; // black pieces white has taken
    const capturedByBlack = []; // white pieces black has taken

    for (const m of verboseHist) {
      if (!m.captured) continue;
      if (m.color === 'w') capturedByWhite.push(m.captured);
      else capturedByBlack.push(m.captured);
    }

    const sortPieces = (arr) =>
      [...arr].sort((a, b) => PIECE_VALUE_ORDER.indexOf(a) - PIECE_VALUE_ORDER.indexOf(b));

    const renderTray = (el, pieces, color) => {
      el.innerHTML = '';
      for (const type of sortPieces(pieces)) {
        el.appendChild(createPieceEl(color, type, 'cap-piece'));
      }
    };

    // Trays sit visually on the capturing player's side of the board.
    if (boardFlipped) {
      renderTray(capturedTopEl, capturedByWhite, 'b');
      renderTray(capturedBottomEl, capturedByBlack, 'w');
    } else {
      renderTray(capturedTopEl, capturedByBlack, 'w');
      renderTray(capturedBottomEl, capturedByWhite, 'b');
    }
  }

  // -- Interaction -----------------------------------------------------

  // -- Computer opponent ---------------------------------------------

  function computerLevel() {
    return COMPUTER_LEVELS[selOpponent.value] || null;
  }

  function isComputerTurn() {
    return Boolean(computerLevel()) && game.turn() === COMPUTER_COLOR && !game.isGameOver();
  }

  function maybeStartComputerMove() {
    if (!isComputerTurn()) return;
    render(); // paint the "thinking" banner before the search blocks the thread
    thinkingTimer = setTimeout(() => {
      thinkingTimer = null;
      const move = window.ChessEngine.chooseMove(game, computerLevel());
      if (move) commitMove(move.from, move.to, move.promotion);
    }, THINKING_DELAY_MS);
  }

  // The search itself runs synchronously once it starts, so cancelling the
  // pending timer is enough to stop a queued move from landing on a position
  // the player has since changed.
  function cancelComputerMove() {
    if (thinkingTimer === null) return;
    clearTimeout(thinkingTimer);
    thinkingTimer = null;
  }

  function onSquareClick(square) {
    if (pendingPromotion) return;

    // Name whatever was clicked, even a piece that can't move right now —
    // clicking to find out what a piece is called is worth supporting.
    const piece = game.get(square);
    labeledPiece = piece ? { color: piece.color, type: piece.type } : null;

    if (game.isGameOver() || isComputerTurn()) {
      render();
      return;
    }

    if (selectedSquare) {
      if (selectedSquare === square) {
        clearSelection();
        render();
        return;
      }

      const matches = targetsForSquare(square);
      if (matches.length > 0) {
        if (matches.length > 1) {
          // Multiple matches for one destination square only happens for
          // pawn promotion (one entry per promotion piece).
          openPromotionPicker(selectedSquare, square);
        } else {
          commitMove(matches[0].from, matches[0].to);
        }
        return;
      }

      if (piece && piece.color === game.turn()) {
        selectSquare(square);
      } else {
        clearSelection();
        render();
      }
      return;
    }

    if (piece && piece.color === game.turn()) {
      selectSquare(square);
    } else {
      render(); // nothing to select, but the label still needs updating
    }
  }

  function selectSquare(square) {
    selectedSquare = square;
    legalTargets = game.moves({ square, verbose: true });
    render();
  }

  function clearSelection() {
    selectedSquare = null;
    legalTargets = [];
  }

  function commitMove(from, to, promotion) {
    const move = game.move({ from, to, promotion });
    lastMove = { from: move.from, to: move.to };
    clearSelection();
    labeledPiece = null;

    const wasFlipped = boardFlipped;
    if (chkAutoFlip.checked) {
      boardFlipped = game.turn() === 'b';
    }

    render();

    // Sliding across a board that just reoriented would read as the wrong move.
    const sliding = boardFlipped === wasFlipped && animateSlides(slidesForMove(move));

    // Let the piece land before announcing the result.
    if (sliding) setTimeout(checkGameOver, MOVE_ANIMATION_MS);
    else checkGameOver();

    maybeStartComputerMove();
  }

  function openPromotionPicker(from, to) {
    pendingPromotion = { from, to };
    const color = game.turn();
    promoChoicesEl.innerHTML = '';
    for (const type of ['q', 'r', 'b', 'n']) {
      const btn = document.createElement('button');
      btn.appendChild(createPieceEl(color, type, 'promo-piece'));
      btn.setAttribute('aria-label', `Promote to ${PIECE_NAMES[type]}`);
      btn.addEventListener('click', () => {
        const { from: f, to: t } = pendingPromotion;
        pendingPromotion = null;
        hideModal(promoModal);
        commitMove(f, t, type);
      });
      promoChoicesEl.appendChild(btn);
    }
    showModal(promoModal);
  }

  function cancelPromotion() {
    pendingPromotion = null;
    hideModal(promoModal);
    clearSelection();
    render();
  }

  // -- Game over ---------------------------------------------------------

  function checkGameOver() {
    if (!game.isGameOver()) {
      statusBlockEl.hidden = true;
      return;
    }

    let title = 'Game Over';
    let detail = '';

    if (game.isCheckmate()) {
      const winner = game.turn() === 'w' ? 'Black' : 'White';
      title = 'Checkmate!';
      detail = `${winner} wins the game.`;
    } else if (game.isStalemate()) {
      title = 'Stalemate';
      detail = "It's a draw — the player to move has no legal moves.";
    } else if (game.isThreefoldRepetition()) {
      title = 'Draw';
      detail = 'Draw by threefold repetition.';
    } else if (game.isInsufficientMaterial()) {
      title = 'Draw';
      detail = 'Draw by insufficient material.';
    } else if (game.isDrawByFiftyMoves()) {
      title = 'Draw';
      detail = 'Draw by the fifty-move rule.';
    } else if (game.isDraw()) {
      title = 'Draw';
      detail = 'The game is a draw.';
    }

    gameOverTitleEl.textContent = title;
    gameOverDetailEl.textContent = detail;
    statusTextEl.textContent = `${title} ${detail}`;
    statusBlockEl.hidden = false;
    showModal(gameOverModal);
  }

  // -- Controls ------------------------------------------------------

  function newGame() {
    cancelComputerMove();
    game.reset();
    boardFlipped = false;
    chkAutoFlip.checked = false;
    updateOptionState();
    lastMove = null;
    clearSelection();
    labeledPiece = null;
    statusBlockEl.hidden = true;
    hideModal(gameOverModal);
    render();
    maybeStartComputerMove();
  }

  function undoMove() {
    if (pendingPromotion) cancelPromotion();
    cancelComputerMove();

    const undone = game.undo();
    if (!undone) return;

    // Against the computer, step back over its reply too, so Undo hands the
    // player back their own move rather than leaving the computer to move.
    if (computerLevel() && game.turn() === COMPUTER_COLOR && game.history().length) {
      game.undo();
    }

    const hist = game.history({ verbose: true });
    lastMove = hist.length ? { from: hist[hist.length - 1].from, to: hist[hist.length - 1].to } : null;
    clearSelection();
    labeledPiece = null;

    if (chkAutoFlip.checked) {
      boardFlipped = game.turn() === 'b';
    }

    hideModal(gameOverModal);
    statusBlockEl.hidden = true;
    render();
  }

  function toggleFlip() {
    if (chkAutoFlip.checked) return;
    boardFlipped = !boardFlipped;
    render();
  }

  function updateOptionState() {
    // Auto-flip exists for two people sharing one screen; against the computer
    // it would just swing the board away every time the player moves.
    const vsComputer = Boolean(computerLevel());
    if (vsComputer) chkAutoFlip.checked = false;
    chkAutoFlip.disabled = vsComputer;

    btnFlip.disabled = chkAutoFlip.checked;
    btnFlip.title = chkAutoFlip.checked
      ? 'Turn off auto-flip to flip the board manually'
      : '';
  }

  function showModal(el) {
    el.hidden = false;
  }

  function hideModal(el) {
    el.hidden = true;
  }

  // -- Wire up events --------------------------------------------------

  btnNewGame.addEventListener('click', newGame);
  btnUndo.addEventListener('click', undoMove);
  btnFlip.addEventListener('click', toggleFlip);
  btnHelp.addEventListener('click', () => showModal(helpModal));
  btnCloseHelp.addEventListener('click', () => hideModal(helpModal));
  btnPlayAgain.addEventListener('click', newGame);

  chkAutoFlip.addEventListener('change', () => {
    updateOptionState();
    if (chkAutoFlip.checked) {
      boardFlipped = game.turn() === 'b';
      render();
    }
  });

  selOpponent.addEventListener('change', () => {
    cancelComputerMove();
    clearSelection();
    if (computerLevel()) boardFlipped = false;
    updateOptionState();
    render();
    maybeStartComputerMove(); // picking a computer mid-game shouldn't stall its turn
  });

  chkLegalHints.addEventListener('change', render);

  for (const overlay of [helpModal, promoModal, gameOverModal]) {
    overlay.addEventListener('click', (e) => {
      if (e.target !== overlay) return;
      if (overlay === promoModal) cancelPromotion();
      else if (overlay !== gameOverModal) hideModal(overlay);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!promoModal.hidden) cancelPromotion();
    else if (!helpModal.hidden) hideModal(helpModal);
    else if (selectedSquare) {
      clearSelection();
      render();
    }
  });

  // -- Init --------------------------------------------------------------
  updateOptionState();
  render();
})();
