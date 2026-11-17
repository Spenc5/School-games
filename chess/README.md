# Chess

A click-to-play chess game built for running social-skills sessions over Zoom.

It's a single self-contained web page — no accounts, no server, no internet
connection required after the page loads. It's designed to be used with
**Zoom's screen-share + Remote Control** feature: you share this page, and
give remote control to whichever student is taking their turn, so they click
moves on your screen from their own computer.

## Running it

Open `index.html` in any modern browser (double-click the file, or host the
folder on any static file server / GitHub Pages). There's nothing to build
or install.

## Using it with Zoom

1. Open this page and **Share Screen** in Zoom, picking the browser
   window/tab.
2. When it's a student's turn, use Zoom's **Remote Control** option (in the
   screen-share toolbar) so they can click on your screen from their own
   computer.
3. Players **click a piece**, then **click a highlighted square** to move it
   — there's no drag-and-drop, which keeps things reliable over remote
   control and any Zoom lag.
4. Turn on **"Auto-flip board"** so the board always faces whoever's turn it
   is — handy when control passes back and forth on one shared screen.
5. Use **Undo** if a student wants to try a move again, without restarting
   the game.
6. Set **Opponent** to one of the Computer levels to play solo — handy for
   trying the board out before a session. The computer plays Black.

The in-app **Help** button repeats these steps at any time.

## Features

- Click-to-select / click-to-move interaction (no dragging)
- Optional computer opponent at three levels, for solo play and testing
- Legal-move highlighting, check/checkmate/stalemate/draw detection
- A large, high-contrast turn banner so it's readable on a shared screen
- Board auto-flip (or manual flip) so play can face either side
- Move list, captured-piece trays, undo, and new game
- Pieces are colored/outlined with CSS rather than relying on font-specific
  Unicode rendering, so White vs. Black stays clearly distinguishable across
  different operating systems and video compression
- No network dependency: the chess rules engine ([chess.js](https://github.com/jhlywa/chess.js),
  BSD-2-Clause) is vendored locally in `vendor/chess.js`, so the game keeps
  working even on a restrictive school network or fully offline

## Files

- `index.html` — page structure
- `style.css` — styling
- `app.js` — game logic and UI wiring
- `engine.js` — computer opponent (alpha-beta search over a material +
  piece-square evaluation)
- `vendor/chess.js` — vendored chess rules engine (move generation, check/
  checkmate detection)
