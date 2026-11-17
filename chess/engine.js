/*
 * A small chess engine: negamax with alpha-beta pruning over a
 * material + piece-square-table evaluation.
 *
 * The search uses chess.js's internal move API (_moves/_makeMove/_undoMove)
 * rather than the public one. The public API builds a Move object per move,
 * which generates SAN and two FEN strings every time — that measured ~22x
 * slower and puts a useful search depth out of reach. This is safe because
 * vendor/chess.js is a pinned local copy that never changes underneath us.
 */
(() => {
  'use strict';

  const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
  const MATE = 100000;

  // Read from White's point of view: index 0 is a8, index 63 is h1.
  const TABLES = {
    p: [
        0,  0,  0,  0,  0,  0,  0,  0,
       50, 50, 50, 50, 50, 50, 50, 50,
       10, 10, 20, 30, 30, 20, 10, 10,
        5,  5, 10, 25, 25, 10,  5,  5,
        0,  0,  0, 20, 20,  0,  0,  0,
        5, -5,-10,  0,  0,-10, -5,  5,
        5, 10, 10,-20,-20, 10, 10,  5,
        0,  0,  0,  0,  0,  0,  0,  0,
    ],
    n: [
      -50,-40,-30,-30,-30,-30,-40,-50,
      -40,-20,  0,  0,  0,  0,-20,-40,
      -30,  0, 10, 15, 15, 10,  0,-30,
      -30,  5, 15, 20, 20, 15,  5,-30,
      -30,  0, 15, 20, 20, 15,  0,-30,
      -30,  5, 10, 15, 15, 10,  5,-30,
      -40,-20,  0,  5,  5,  0,-20,-40,
      -50,-40,-30,-30,-30,-30,-40,-50,
    ],
    b: [
      -20,-10,-10,-10,-10,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5, 10, 10,  5,  0,-10,
      -10,  5,  5, 10, 10,  5,  5,-10,
      -10,  0, 10, 10, 10, 10,  0,-10,
      -10, 10, 10, 10, 10, 10, 10,-10,
      -10,  5,  0,  0,  0,  0,  5,-10,
      -20,-10,-10,-10,-10,-10,-10,-20,
    ],
    r: [
        0,  0,  0,  0,  0,  0,  0,  0,
        5, 10, 10, 10, 10, 10, 10,  5,
       -5,  0,  0,  0,  0,  0,  0, -5,
       -5,  0,  0,  0,  0,  0,  0, -5,
       -5,  0,  0,  0,  0,  0,  0, -5,
       -5,  0,  0,  0,  0,  0,  0, -5,
       -5,  0,  0,  0,  0,  0,  0, -5,
        0,  0,  0,  5,  5,  0,  0,  0,
    ],
    q: [
      -20,-10,-10, -5, -5,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5,  5,  5,  5,  0,-10,
       -5,  0,  5,  5,  5,  5,  0, -5,
        0,  0,  5,  5,  5,  5,  0, -5,
      -10,  5,  5,  5,  5,  5,  0,-10,
      -10,  0,  5,  0,  0,  0,  0,-10,
      -20,-10,-10, -5, -5,-10,-10,-20,
    ],
    k: [
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20,
      -10,-20,-20,-20,-20,-20,-20,-10,
       20, 20,  0,  0,  0,  0, 20, 20,
       20, 30, 10,  0,  0, 10, 30, 20,
    ],
  };

  // Score the position from White's point of view.
  function evaluate(game) {
    const board = game.board();
    let score = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (!piece) continue;
        const index = piece.color === 'w' ? row * 8 + col : (7 - row) * 8 + col;
        const value = VALUE[piece.type] + TABLES[piece.type][index];
        score += piece.color === 'w' ? value : -value;
      }
    }
    return score;
  }

  // Try captures first: more cutoffs, so less of the tree gets searched.
  function orderMoves(moves) {
    return moves.sort((a, b) => captureScore(b) - captureScore(a));
  }

  function captureScore(move) {
    if (!move.captured) return 0;
    return VALUE[move.captured] - VALUE[move.piece] / 10;
  }

  function negamax(game, depth, alpha, beta, ply) {
    const moves = orderMoves(game._moves({ legal: true }));

    if (moves.length === 0) {
      // Prefer mating sooner, and being mated later.
      return game.isCheck() ? -MATE + ply : 0;
    }
    if (depth === 0) {
      return game.turn() === 'w' ? evaluate(game) : -evaluate(game);
    }

    let best = -Infinity;
    for (const move of moves) {
      game._makeMove(move);
      const score = -negamax(game, depth - 1, -beta, -alpha, ply + 1);
      game._undoMove();

      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  /*
   * Pick a move for the side to play. `jitter` widens the pool of moves
   * considered good enough to choose between, which is what makes the easier
   * levels beatable instead of merely slower.
   */
  function chooseMove(game, { depth, jitter = 0 }) {
    const rootMoves = game.moves({ verbose: true });
    if (rootMoves.length === 0) return null;

    const scored = [];
    for (const move of rootMoves) {
      game.move({ from: move.from, to: move.to, promotion: move.promotion });
      const score = -negamax(game, depth - 1, -Infinity, Infinity, 1);
      game.undo();
      scored.push({ move, score });
    }

    const best = Math.max(...scored.map((entry) => entry.score));
    const pool = scored.filter((entry) => entry.score >= best - jitter);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return pick.move;
  }

  window.ChessEngine = { chooseMove };
})();
