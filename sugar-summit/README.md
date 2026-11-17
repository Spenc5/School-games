# 🍭 Sugar Summit

A small browser board game in the spirit of Candy Land and Chutes & Ladders.
Spin the wheel, ride the candy canes up, dodge the sugar slides down, and be the
first piece to land on space 64.

No dependencies, no build step, no server required.

## Play

Open `index.html` in any modern browser — double-click the file, or serve the
folder if you prefer:

```sh
npx http-server -p 8080 .   # then visit http://localhost:8080
```

## Rules

- 2–4 players. Each seat can be a **Human** or a **Computer**, so you can play
  solo, pass-and-play, or watch the machines race each other.
- **Colours** are shown as a row of swatches under each seat — click one to take
  it. You can also change a colour mid-game from the dot beside a player's name,
  and it is remembered for the next game. Taking a colour someone else holds
  trades the two, so no two pieces ever match.
- **Who goes first** is settled by a spin: everyone spins once, highest starts,
  and a tie spins again between the tied players only. Uncheck *Spin for who
  goes first* in the setup to skip it and start with the top seat.
- Pieces wait in the tray below the board. Tap the spinner itself (or press
  <kbd>space</kbd>) for 1–6 — there's no separate button.
- **You move your own piece.** Spinning doesn't move it: tap each space in turn
  and count them off, the way you would at a table. Your first count of **one**
  brings your piece off the tray and onto space 1. <kbd>space</kbd> counts too,
  and a wrong tap nudges you back on track instead of moving you.
- 🍬 **Candy cane** — land on one and it glows. Tap the cane itself and your
  piece climbs it, with a chime on the way up.
- 🌀 **Sugar slide** — tap the slide and your piece rides the curve down to the
  bottom, with a swoop.
- ⭐ **Star space** — spin again immediately.
- 🍮 **Sticky space** — you lose your next turn.
- Space 64 must be hit **exactly**; overshoot and your piece bounces back off
  the summit.

Each space that starts a cane or slide shows its destination, e.g. `34↓13`, and
landing spaces are outlined in white.

Sound is synthesised in the browser (Web Audio), so there are no audio files to
load. The speaker button in the header mutes it, and the choice is remembered.

The board sizes itself to the window so the whole game is visible at once
without scrolling; on a phone the board fills the screen and the controls sit
just below it.

## Files

| File | What's in it |
| --- | --- |
| `index.html` | Page structure — board, start tray, spinner, scoreboard |
| `styles.css` | Candy palette, board grid, responsive layout, animations |
| `game.js` | Board layout, spinner, turn flow, movement, sound, computer players |

Board contents live at the top of `game.js` — `CANES`, `SLIDES`, `STARS` and
`STICKY` are plain maps from space number to effect, so the board is easy to
re-tune. `SIZE` controls the grid (8×8 = 64 spaces).

## Notes

Tested by driving the real page in headless Chromium, including a full game
played entirely by hand (spin, then tap out every space): pieces never move on
their own, wrong taps are refused, counts land where they should, and canes and
slides wait to be taken. Computer-played games at 2, 3 and 4 players all reach a
winner (roughly 30–60 turns), every rule path fires, and the layout holds down to
a 400px-wide screen with no console errors.
