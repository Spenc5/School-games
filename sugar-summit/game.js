/* Sugar Summit — a browser board game in the spirit of Candy Land
   and Chutes & Ladders. No dependencies, no build step. */
(() => {
  'use strict';

  // ── Board definition ───────────────────────────────────────────
  const SIZE = 8;                 // 8 x 8 grid
  const LAST = SIZE * SIZE;       // space 64 is the summit

  // Candy canes carry you up, sugar slides drop you down.
  const CANES  = { 3: 22, 8: 26, 20: 38, 28: 47, 42: 60, 51: 58 };
  const SLIDES = { 24: 9, 34: 13, 45: 27, 53: 35, 57: 40, 62: 44 };
  const LINKS  = Object.assign({}, CANES, SLIDES);

  const STARS  = new Set([11, 33, 49]);   // spin again
  const STICKY = new Set([15, 37, 55]);   // lose your next turn

  const SEATS = [
    { name: 'Player 1', color: '#ec4899', on: true,  cpu: false },
    { name: 'Nougat',   color: '#38bdf8', on: true,  cpu: true  },
    { name: 'Player 3', color: '#34d399', on: false, cpu: false },
    { name: 'Player 4', color: '#fb923c', on: false, cpu: false },
  ];

  const PALETTE = ['#ec4899', '#38bdf8', '#34d399', '#fb923c', '#8b5cf6', '#facc15'];

  const WEDGES = [1, 4, 2, 6, 3, 5];      // values around the spinner
  const WEDGE_FILL = ['#8b5cf6', '#ec4899', '#fb923c', '#facc15', '#34d399', '#38bdf8'];

  // ── Element handles ────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const board = $('board'), links = $('links'), tokensLayer = $('tokens');
  const boardCol = document.querySelector('.board-col'), boardWrap = document.querySelector('.board-wrap');
  const soundBtn = $('sound-btn');
  const setupPanel = $('setup'), setupRows = $('setup-rows'), playPanel = $('play');
  const wheel = $('wheel'), spinner = $('spinner'), spinResult = $('spin-result');
  const startTray = $('tray-slots');
  const turnName = $('turn-name'), turnDot = $('turn-dot');
  const moveTray = $('move-tray'), moveLabel = $('move-label'), pips = $('pips');
  const scoreboard = $('scoreboard'), announce = $('announce');
  const winnerBox = $('winner'), winnerName = $('winner-name'), winnerSub = $('winner-sub');

  // ── State ──────────────────────────────────────────────────────
  let players = [];
  let turn = 0;
  let busy = false;         // true while an animation or CPU move is running
  let over = false;
  let move = null;          // the piece a human is currently moving, and its remaining count
  let phase = 'play';       // 'order' while spinning for who goes first
  let spotlight = null;     // whose turn the panel is showing, during the roll-off
  let orderSpin = null;     // the roll-off spin we are waiting on
  const orderRolls = new Map();
  let colourOpen = null;    // scoreboard palette that is open, by player id
  let nudgeTimer = 0;
  let wheelAngle = 0;       // cumulative rotation, so the wheel always spins forward
  let centers = [];         // centers[n] = { x, y } in board percent
  const linkGeom = {};      // space → { a, b, c } so a piece can travel the line it is on
  let travelRaf = 0;
  let timers = [];

  const sleep = (ms) => new Promise((res) => timers.push(setTimeout(res, ms)));
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
    clearNudge();
    if (travelRaf) { cancelAnimationFrame(travelRaf); travelRaf = 0; }
  };
  const roll = () => 1 + Math.floor(Math.random() * 6);

  // ── Sound ──────────────────────────────────────────────────────
  // Everything is synthesised, so the game stays a few files with nothing to load.
  let audio = null, muted = false;
  try { muted = localStorage.getItem('sugar-summit-muted') === '1'; } catch { /* storage blocked */ }

  function audioCtx() {
    if (muted) return null;
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
    }
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }

  function tone(ac, { freq, to, at, len, type = 'sine', gain = 0.12 }) {
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, at + len);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(amp).connect(ac.destination);
    osc.start(at);
    osc.stop(at + len + 0.05);
  }

  function playSound(name) {
    let ac = null;
    try { ac = audioCtx(); } catch { return; }    // no audio device, or blocked
    if (!ac) return;
    const t = ac.currentTime;

    if (name === 'climb') {                    // a bright run up the scale
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(ac, { freq: f, at: t + i * 0.1, len: 0.17, type: 'triangle', gain: 0.16 }));
    } else if (name === 'slide') {             // one long swoop down
      tone(ac, { freq: 900, to: 150, at: t, len: 0.7, type: 'sawtooth', gain: 0.09 });
      tone(ac, { freq: 450, to: 75, at: t, len: 0.7, type: 'sine', gain: 0.09 });
    } else if (name === 'step') {
      tone(ac, { freq: 640, at: t, len: 0.07, type: 'square', gain: 0.045 });
    } else if (name === 'spin') {
      tone(ac, { freq: 280, to: 660, at: t, len: 0.55, type: 'triangle', gain: 0.055 });
    } else if (name === 'win') {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
        tone(ac, { freq: f, at: t + i * 0.13, len: 0.42, type: 'triangle', gain: 0.17 }));
    }
  }

  function paintSoundBtn() {
    soundBtn.textContent = muted ? '🔇' : '🔊';
    soundBtn.setAttribute('aria-pressed', String(!muted));
    soundBtn.title = muted ? 'Sound off' : 'Sound on';
  }

  // ── Geometry ───────────────────────────────────────────────────
  // Space 1 sits bottom-left; numbering snakes back and forth up the board.
  function coords(n) {
    const row = Math.floor((n - 1) / SIZE);              // 0 = bottom row
    const step = (n - 1) % SIZE;
    const col = row % 2 === 0 ? step : SIZE - 1 - step;
    return { col, rowFromTop: SIZE - 1 - row };
  }

  // Size the board to the room actually left on screen, so the whole game is
  // visible at once instead of running off the bottom.
  function fitBoard() {
    if (!boardCol || !boardWrap) return;
    const tray = boardWrap.querySelector('.start-tray');
    const cs = getComputedStyle(boardWrap);
    const chrome = (parseFloat(cs.paddingLeft) + parseFloat(cs.borderTopWidth)) * 2;
    const trayH = tray ? tray.offsetHeight + 8 : 0;
    const top = boardCol.getBoundingClientRect().top + window.scrollY;
    const room = window.innerHeight - top - 14 - chrome - trayH;
    const size = Math.max(248, Math.min(boardCol.clientWidth - chrome, room));
    board.style.width = `${size}px`;
    board.style.height = `${size}px`;
    board.style.setProperty('--tile', `${size / SIZE}px`);
  }

  function relayout() { fitBoard(); measure(); }

  function measure() {
    const b = board.getBoundingClientRect();
    if (!b.width) return;
    centers = [];
    const tray = startTray.getBoundingClientRect();
    centers[0] = {                       // off-board: the start tray
      x: ((tray.left - b.left) + tray.width / 2) / b.width * 100,
      y: ((tray.top - b.top) + tray.height / 2) / b.height * 100,
      w: tray.width / b.width * 100,
    };
    for (let n = 1; n <= LAST; n++) {
      const el = board.querySelector(`[data-space="${n}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      centers[n] = {
        x: ((r.left - b.left) + r.width / 2) / b.width * 100,
        y: ((r.top - b.top) + r.height / 2) / b.height * 100,
      };
    }
    drawLinks();
    players.forEach(placeToken);
  }

  // ── Board rendering ────────────────────────────────────────────
  function buildBoard() {
    const cells = [];
    for (let rowFromTop = 0; rowFromTop < SIZE; rowFromTop++) {
      for (let col = 0; col < SIZE; col++) {
        const row = SIZE - 1 - rowFromTop;
        const step = row % 2 === 0 ? col : SIZE - 1 - col;
        cells.push(row * SIZE + step + 1);
      }
    }

    board.querySelectorAll('.tile').forEach((el) => el.remove());
    const frag = document.createDocumentFragment();

    cells.forEach((n) => {
      const tile = document.createElement('div');
      tile.className = `tile c${(n + Math.floor((n - 1) / SIZE)) % 6}`;
      tile.dataset.space = String(n);

      const landing = Object.values(LINKS).includes(n);
      if (landing) tile.classList.add('landing');

      let mark = '', dest = '';
      if (CANES[n]) { mark = '🍬'; dest = `↑${CANES[n]}`; tile.title = `Candy cane up to ${CANES[n]}`; }
      else if (SLIDES[n]) { mark = '🌀'; dest = `↓${SLIDES[n]}`; tile.title = `Sugar slide down to ${SLIDES[n]}`; }
      else if (STARS.has(n)) { mark = '⭐'; tile.title = 'Spin again'; }
      else if (STICKY.has(n)) { mark = '🍮'; tile.title = 'Lose a turn'; }

      if (n === 1) { tile.classList.add('start'); tile.innerHTML = '<span class="label">START</span><span class="num">1</span>'; }
      else if (n === LAST) { tile.classList.add('finish'); tile.innerHTML = '<span class="label">🏔 64</span>'; }
      else {
        tile.innerHTML = `<span class="num">${n}</span>`
          + (mark ? `<span class="mark">${mark}</span>` : '')
          + (dest ? `<span class="dest">${dest}</span>` : '');
      }

      frag.appendChild(tile);
    });

    board.insertBefore(frag, links);
  }

  function svg(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function drawLinks() {
    links.setAttribute('viewBox', '0 0 100 100');
    links.textContent = '';
    Object.keys(linkGeom).forEach((k) => delete linkGeom[k]);
    if (!centers.length) return;

    for (const [fromStr, to] of Object.entries(LINKS)) {
      const from = Number(fromStr);
      const a = centers[from], b = centers[to];
      if (!a || !b) continue;

      const cane = Boolean(CANES[from]);
      const g = svg('g', { class: `link ${cane ? 'cane' : 'slide'}`, 'data-from': from });
      let d;

      if (cane) {
        // Two rails plus rungs — a candy-cane ladder.
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (-dy / len) * 1.5, oy = (dx / len) * 1.5;

        [[ox, oy], [-ox, -oy]].forEach(([px, py]) => {
          g.appendChild(svg('line', {
            class: 'ladder', x1: a.x + px, y1: a.y + py, x2: b.x + px, y2: b.y + py,
          }));
        });

        const rungs = Math.max(2, Math.round(len / 5));
        for (let i = 1; i < rungs; i++) {
          const t = i / rungs;
          const cx = a.x + dx * t, cy = a.y + dy * t;
          g.appendChild(svg('line', {
            class: 'ladder-rung', x1: cx + ox, y1: cy + oy, x2: cx - ox, y2: cy - oy,
          }));
        }
        d = `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
        linkGeom[from] = { a, b, c: null };
      } else {
        // A lazy S-curve for the slide.
        const c = { x: (a.x + b.x) / 2 + (a.x < b.x ? 6 : -6), y: (a.y + b.y) / 2 };
        d = `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`;
        g.appendChild(svg('path', { class: 'chute', d, fill: 'none' }));
        linkGeom[from] = { a, b, c };
      }

      // A fat invisible stroke, so the line itself is easy to hit.
      g.appendChild(svg('path', { class: 'hit', d, fill: 'none' }));
      links.appendChild(g);
    }
  }

  // ── Spinner ────────────────────────────────────────────────────
  function buildWheel() {
    wheel.textContent = '';
    const r = 92, span = 360 / WEDGES.length;
    const pt = (deg, rad) => {
      const a = (deg - 90) * Math.PI / 180;
      return [(rad * Math.cos(a)).toFixed(2), (rad * Math.sin(a)).toFixed(2)];
    };

    WEDGES.forEach((value, i) => {
      const [x1, y1] = pt(i * span, r);
      const [x2, y2] = pt((i + 1) * span, r);
      wheel.appendChild(svg('path', {
        d: `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`,
        fill: WEDGE_FILL[i % WEDGE_FILL.length],
        stroke: '#fff',
        'stroke-width': 3,
      }));
      const [tx, ty] = pt(i * span + span / 2, r * 0.68);
      const label = svg('text', { x: tx, y: ty, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
      label.textContent = String(value);
      wheel.appendChild(label);
    });

    wheel.appendChild(svg('circle', { cx: 0, cy: 0, r: 30, fill: '#fff', stroke: '#f0d9e8', 'stroke-width': 4 }));
  }

  function spinWheelTo(value) {
    const idx = WEDGES.indexOf(value);
    const span = 360 / WEDGES.length;
    const target = -(idx * span + span / 2);           // bring that wedge under the needle
    const turns = 4 + Math.floor(Math.random() * 2);
    const next = wheelAngle + turns * 360 + (((target - wheelAngle) % 360) + 360) % 360;
    wheelAngle = next;
    wheel.style.transform = `rotate(${next}deg)`;
  }

  // ── Players & tokens ───────────────────────────────────────────
  function placeToken(p) {
    const spot = centers[p.pos];
    if (!spot) return;

    // Off the board: line the pieces up in the tray, ready to be counted on.
    if (p.pos === 0) {
      const waiting = players.filter((q) => q.pos === 0);
      const slot = Math.max(0, waiting.indexOf(p));
      const step = Math.min(9, spot.w / (waiting.length + 1));
      p.el.style.left = `${spot.x + (slot - (waiting.length - 1) / 2) * step}%`;
      p.el.style.top = `${spot.y}%`;
      p.el.style.opacity = '1';
      return;
    }

    // Nudge tokens sharing a space so nobody hides underneath.
    const mates = players.filter((q) => q.pos === p.pos);
    const slot = Math.max(0, mates.indexOf(p));
    const spread = mates.length > 1 ? 2.6 : 0;
    const angle = (slot / Math.max(1, mates.length)) * Math.PI * 2;
    const offX = spread * Math.cos(angle), offY = spread * Math.sin(angle);

    p.el.style.left = `${spot.x + offX}%`;
    p.el.style.top = `${spot.y + offY}%`;   // pieces waiting at START sit on space 1, dimmed
    p.el.style.opacity = '1';
  }

  function refreshTokens() { players.forEach(placeToken); }

  // A row of colours with the current one ringed; picking one already in use
  // trades the two, so no two pieces ever match.
  function swatchRow(current, isTaken, pick) {
    const row = document.createElement('div');
    row.className = 'swatches';
    PALETTE.forEach((color) => {
      const taken = color !== current && isTaken(color);
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `swatch${color === current ? ' current' : ''}${taken ? ' taken' : ''}`;
      dot.style.background = color;
      dot.setAttribute('aria-pressed', String(color === current));
      dot.setAttribute('aria-label', color === current ? 'Current colour'
        : taken ? 'Swap for this colour' : 'Use this colour');
      dot.addEventListener('click', (e) => { e.stopPropagation(); pick(color); });
      row.appendChild(dot);
    });
    return row;
  }

  function buildSeats() {
    setupRows.textContent = '';

    SEATS.forEach((seat, i) => {
      const row = document.createElement('div');
      row.className = 'seat';
      row.dataset.off = String(!seat.on);
      row.innerHTML = `
        <input class="toggle" type="checkbox" ${seat.on ? 'checked' : ''} aria-label="Seat ${i + 1} in play">
        <input type="text" value="${seat.name}" maxlength="14" aria-label="Name for seat ${i + 1}">
        <button class="kind" type="button" aria-pressed="${seat.cpu}">${seat.cpu ? 'Computer' : 'Human'}</button>
      `;
      const [toggle, text, kind] = row.children;

      row.appendChild(swatchRow(
        seat.color,
        (color) => SEATS.some((s2, j) => j !== i && s2.color === color),
        (color) => pickSeatColor(i, color),
      ));

      toggle.addEventListener('change', () => {
        seat.on = toggle.checked;
        row.dataset.off = String(!seat.on);
        $('start-btn').disabled = SEATS.filter((s2) => s2.on).length < 2;
      });
      text.addEventListener('input', () => { seat.name = text.value.trim() || `Player ${i + 1}`; });
      kind.addEventListener('click', () => {
        seat.cpu = !seat.cpu;
        kind.setAttribute('aria-pressed', String(seat.cpu));
        kind.textContent = seat.cpu ? 'Computer' : 'Human';
      });

      setupRows.appendChild(row);
    });
  }

  function pickSeatColor(i, color) {
    const other = SEATS.findIndex((s2, j) => j !== i && s2.color === color);
    if (other >= 0) SEATS[other].color = SEATS[i].color;
    SEATS[i].color = color;
    buildSeats();
  }

  // Colours can also be changed mid-game, from the scoreboard.
  function pickPlayerColor(p, color) {
    const other = players.find((q) => q !== p && q.color === color);
    if (other) { other.color = p.color; paintToken(other); }
    p.color = color;
    paintToken(p);

    // Remember it for the next game, and keep the sitting-out seats distinct.
    players.forEach((q) => { q.seat.color = q.color; });
    SEATS.filter((s2) => !s2.on).forEach((s2) => {
      if (SEATS.some((o) => o !== s2 && o.color === s2.color)) {
        s2.color = PALETTE.find((c) => !SEATS.some((o) => o.color === c)) || s2.color;
      }
    });

    colourOpen = colourOpen === p.id ? null : colourOpen;
    refreshScores();
    const lead = spotlight || players[turn];
    if (lead) turnDot.style.background = lead.color;
  }

  function paintToken(p) {
    p.el.style.background = p.color;
    p.el.style.color = p.color;
  }

  // ── Log & scoreboard ───────────────────────────────────────────
  // One live line: whatever just happened on the board.
  function say(text) {
    announce.textContent = text;
    announce.classList.remove('fresh');
    void announce.offsetWidth;          // restart the animation
    announce.classList.add('fresh');
  }

  function refreshScores() {
    scoreboard.textContent = '';
    const lead = spotlight || (over ? null : players[turn]);

    players.forEach((p) => {
      const li = document.createElement('li');
      if (p === lead) li.classList.add('now');

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.style.background = p.color;
      chip.title = 'Change colour';
      chip.setAttribute('aria-label', `Colour for ${p.name}`);
      chip.setAttribute('aria-expanded', String(colourOpen === p.id));
      chip.addEventListener('click', () => {
        colourOpen = colourOpen === p.id ? null : p.id;
        refreshScores();
      });
      li.appendChild(chip);

      li.appendChild(document.createTextNode(p.name + (p.cpu ? ' 🤖' : '')));
      if (p.skip) {
        const s2 = document.createElement('span');
        s2.className = 'tagline-skip';
        s2.textContent = ' 🍮 stuck';
        li.appendChild(s2);
      }

      const where = document.createElement('span');
      where.className = 'where';
      const rolled = orderRolls.get(p.id);
      where.textContent = phase === 'order'
        ? (rolled ? `spun ${rolled}` : '—')
        : (p.pos === 0 ? 'start' : `#${p.pos}`);
      li.appendChild(where);

      if (colourOpen === p.id) {
        li.appendChild(swatchRow(
          p.color,
          (color) => players.some((q) => q !== p && q.color === color),
          (color) => pickPlayerColor(p, color),
        ));
      }

      scoreboard.appendChild(li);
    });
  }

  // ── Turn flow ──────────────────────────────────────────────────
  function startGame() {
    clearTimers();
    endMove();
    phase = 'play';
    spotlight = null;
    orderSpin = null;
    orderRolls.clear();
    colourOpen = null;
    over = false;
    busy = false;
    turn = 0;
    announce.textContent = '';
    tokensLayer.textContent = '';
    winnerBox.hidden = true;

    players = SEATS.filter((s) => s.on).map((seat, i) => {
      const el = document.createElement('div');
      el.className = 'token';
      el.style.background = seat.color;
      el.style.color = seat.color;
      el.textContent = seat.cpu ? '🤖' : '';
      tokensLayer.appendChild(el);
      return { id: i, seat, name: seat.name, color: seat.color, cpu: seat.cpu, pos: 0, skip: false, el };
    });

    setupPanel.hidden = true;
    playPanel.hidden = false;
    setHub('Spin');

    relayout();
    refreshTokens();

    if ($('order-opt')?.checked && players.length > 1) return rollForOrder();
    say('Everyone lines up at START. Good luck!');
    beginTurn();
  }

  // ── Who goes first ─────────────────────────────────────────────
  // Everyone spins once; highest starts, and a tie spins again.
  async function rollForOrder() {
    phase = 'order';
    orderRolls.clear();
    let contenders = players.slice();
    let round = 0;

    while (contenders.length > 1) {
      if (round++ === 0) {
        say('Spin to see who goes first — highest starts.');
      } else {
        say(`Tied on ${orderRolls.get(contenders[0].id)} — ${list(contenders)} spin again.`);
        contenders.forEach((p) => orderRolls.delete(p.id));
        refreshScores();
        await sleep(1100);
      }

      for (const p of contenders) {
        if (over) return;
        await orderSpinFor(p);
      }

      const best = Math.max(...contenders.map((p) => orderRolls.get(p.id)));
      contenders = contenders.filter((p) => orderRolls.get(p.id) === best);
    }

    const first = contenders[0];
    spotlight = null;
    phase = 'play';
    orderRolls.clear();
    turn = players.indexOf(first);
    say(`${first.name} spins highest and goes first!`);
    playSound('climb');
    await sleep(1000);
    beginTurn();
  }

  function list(ps) {
    const names = ps.map((p) => p.name);
    return names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  }

  function orderSpinFor(p) {
    return new Promise((resolve) => {
      spotlight = p;
      orderSpin = { p, resolve };
      turnDot.style.background = p.color;
      turnName.textContent = p.cpu ? `${p.name} spins for first move` : `${p.name}, spin for first move`;
      players.forEach((q) => q.el.classList.toggle('active', q === p));
      refreshScores();

      busy = false;
      spinner.disabled = p.cpu;
      if (p.cpu) sleep(650).then(() => { if (orderSpin && orderSpin.p === p) orderSpinTake(); });
      else setHub('Spin');
    });
  }

  async function orderSpinTake() {
    if (!orderSpin || busy || over) return;
    busy = true;
    spinner.disabled = true;

    const { p, resolve } = orderSpin;
    orderSpin = null;

    const n = roll();
    setHub('…');
    playSound('spin');
    spinWheelTo(n);
    await sleep(900);
    setHub(n);
    orderRolls.set(p.id, n);
    refreshScores();
    say(`${p.name} spins a ${n}.`);
    playSound('step');
    await sleep(600);
    busy = false;
    resolve(n);
  }

  function beginTurn() {
    if (over) return;
    const p = players[turn];
    turnName.textContent = p.cpu ? `${p.name}'s turn 🤖` : `${p.name}, spin to move`;
    turnDot.style.background = p.color;
    players.forEach((q) => q.el.classList.toggle('active', q === p));
    refreshScores();

    if (p.skip) {
      p.skip = false;
      refreshScores();
      say(`${p.name} is stuck in caramel and misses a turn.`);
      busy = true;
      spinner.disabled = true;
      sleep(1100).then(nextTurn);
      return;
    }

    spinner.disabled = p.cpu;
    if (!p.cpu) setHub('Spin');
    busy = false;
    if (p.cpu) sleep(550).then(() => { if (!over && players[turn] === p) takeTurn(); });
  }

  function nextTurn() {
    if (over) return;
    turn = (turn + 1) % players.length;
    beginTurn();
  }

  // ── Turn flow ──────────────────────────────────────────────────
  // A human spins, then moves their own piece: one tap per space, counted out
  // the way you would at a table. The computer walks its own piece.
  async function takeTurn() {
    if (busy || over || move) return;
    busy = true;
    spinner.disabled = true;

    const p = players[turn];
    const n = roll();
    setHub('…');
    playSound('spin');
    spinWheelTo(n);
    await sleep(900);
    setHub(n);
    say(`${p.name} spins a ${n}.`);

    if (p.cpu) return cpuTurn(p, n);
    handOver(p, n);
  }

  async function cpuTurn(p, n) {
    await walk(p, n);
    if (over) return;
    if (LINKS[p.pos]) await ride(p, LINKS[p.pos]);
    if (over) return;
    await afterLanding(p);
  }

  // ── Moving your own piece ──────────────────────────────────────
  function handOver(p, steps) {
    spinner.blur();
    move = { p, left: steps, dir: 1, counted: 0, mode: 'count' };
    board.classList.add('moving');
    moveTray.hidden = false;
    showPips(steps, 0);
    updatePrompt();
    armNudge();
  }

  // The space this piece reaches when counted on one. The count turns around
  // at the summit, so an overshoot walks back down.
  function nextStep() {
    const dir = move.p.pos === LAST && move.dir === 1 ? -1 : move.dir;
    return { space: move.p.pos + dir, dir };
  }

  function onBoardClick(e) {
    if (!move || over) return;
    const tile = e.target.closest('.tile');
    if (!tile) return;
    const space = Number(tile.dataset.space);

    if (move.mode === 'ride') {
      // The line is the thing to click; the space it lands on also counts.
      if (space !== move.dest) return nudge(move.dest, tile);
      return takeRide();
    }

    const want = nextStep();
    if (space !== want.space) return nudge(want.space, tile);
    stepOnce();
  }

  function takeRide() {
    if (!move || move.mode !== 'ride') return;
    const { p, dest } = move;
    endMove();
    ride(p, dest).then(() => { if (!over) afterLanding(p); });
  }

  function stepOnce() {
    if (!move || move.mode !== 'count' || over) return;
    clearNudge();

    const { space, dir } = nextStep();
    const turned = dir !== move.dir;
    const p = move.p;

    move.dir = dir;
    move.counted += 1;
    move.left -= 1;
    p.pos = space;

    refreshTokens();
    refreshScores();          // the tally follows the piece as it is counted
    hop(space);
    playSound('step');
    countBubble(space, move.counted);
    showPips(move.counted + move.left, move.counted);
    if (turned) say(`${p.name} needs an exact landing, so the count turns back down from the summit.`);

    if (move.left > 0) { updatePrompt(); armNudge(); return; }
    landed(p);
  }

  // Count used up: resolve whatever the piece is standing on.
  function landed(p) {
    endMove();
    refreshScores();
    if (p.pos === LAST) return win(p);

    const dest = LINKS[p.pos];
    if (dest) {
      move = { p, dest, mode: 'ride' };
      board.classList.add('moving');
      moveTray.hidden = false;
      links.querySelector(`.link[data-from="${p.pos}"]`)?.classList.add('live');
      updatePrompt();
      return;
    }
    afterLanding(p);
  }

  async function ride(p, to) {
    const from = p.pos;
    const climbing = Boolean(CANES[from]);
    say(climbing
      ? `🍬 A candy cane! ${p.name} climbs from ${from} to ${to}.`
      : `🌀 A sugar slide! ${p.name} whooshes from ${from} down to ${to}.`);
    playSound(climbing ? 'climb' : 'slide');
    await sleep(140);
    await travel(p, from, to);
    refreshScores();
    await sleep(280);
  }

  // Walk the piece along the line itself: straight up a cane, around the curve
  // of a slide, gathering speed on the way down.
  function travel(p, from, to) {
    const geom = linkGeom[from];
    const a = centers[from], b = centers[to];
    if (!geom || !a || !b || reduceMotion()) {
      p.pos = to;
      refreshTokens();
      return Promise.resolve();
    }

    const c = geom.c;
    const climbing = to > from;
    const ms = climbing ? 900 : 780;

    return new Promise((resolve) => {
      const el = p.el;
      el.classList.add('travelling');
      const t0 = performance.now();

      const frame = (now) => {
        const raw = Math.min(1, (now - t0) / ms);
        const t = climbing
          ? (raw < .5 ? 2 * raw * raw : 1 - 2 * (1 - raw) ** 2)   // steady climb
          : raw * raw;                                            // slides pick up speed
        const x = c ? (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x : a.x + (b.x - a.x) * t;
        const y = c ? (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y : a.y + (b.y - a.y) * t;
        el.style.left = `${x}%`;
        el.style.top = `${y}%`;

        if (raw < 1) { travelRaf = requestAnimationFrame(frame); return; }
        travelRaf = 0;
        el.classList.remove('travelling');
        p.pos = to;
        refreshTokens();
        resolve();
      };
      travelRaf = requestAnimationFrame(frame);
    });
  }

  function reduceMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  async function afterLanding(p) {
    if (over) return;
    if (p.pos === LAST) return win(p);

    if (STARS.has(p.pos)) {
      say(`⭐ ${p.name} lands on a star and spins again!`);
      await sleep(600);
      busy = false;
      if (p.cpu) return takeTurn();
      spinner.disabled = false;
      setHub('Spin');
      turnName.textContent = `${p.name}, spin again!`;
      return;
    }

    if (STICKY.has(p.pos)) {
      p.skip = true;
      refreshScores();
      say(`🍮 ${p.name} gets stuck — next turn is forfeit.`);
    }

    await sleep(300);
    nextTurn();
  }

  function endMove() {
    clearNudge();
    move = null;
    board.classList.remove('moving');
    moveTray.hidden = true;
    links.querySelectorAll('.link.live').forEach((g) => g.classList.remove('live'));
  }

  // ── Move prompts, counting pips, gentle hints ──────────────────
  function updatePrompt() {
    if (!move) return;
    const p = move.p;
    turnName.textContent = `${p.name}, move your piece`;
    moveLabel.textContent = move.mode === 'ride'
      ? (CANES[p.pos] ? '🍬 Tap the candy cane to climb it' : '🌀 Tap the slide to ride it down')
      : (move.left === 1 ? 'One more space — tap it' : `Tap the next space — ${move.left} to go`);
  }

  function showPips(total, done) {
    pips.textContent = '';
    for (let i = 0; i < total; i++) {
      const pip = document.createElement('span');
      pip.className = i < done ? 'pip done' : 'pip';
      if (i < done) pip.textContent = String(i + 1);
      pips.appendChild(pip);
    }
  }

  // The spinner hub reads "Spin" when it is waiting on you, the number once spun.
  function setHub(text) {
    spinResult.textContent = String(text);
    spinResult.classList.toggle('word', !/^\d+$/.test(String(text)));
  }

  function tileEl(n) { return board.querySelector(`[data-space="${n}"]`); }

  function hop(space) {
    const tile = tileEl(space);
    if (!tile) return;
    tile.classList.remove('hop');
    void tile.offsetWidth;            // restart the animation
    tile.classList.add('hop');
  }

  function countBubble(space, n) {
    const spot = centers[space];
    if (!spot) return;
    const bubble = document.createElement('div');
    bubble.className = 'count-bubble';
    bubble.textContent = String(n);
    bubble.style.left = `${spot.x}%`;
    bubble.style.top = `${spot.y}%`;
    tokensLayer.appendChild(bubble);
    timers.push(setTimeout(() => bubble.remove(), 900));
  }

  function hint(space) {
    const tile = tileEl(space);
    if (!tile) return;
    tile.classList.remove('hint');
    void tile.offsetWidth;
    tile.classList.add('hint');
    timers.push(setTimeout(() => tile.classList.remove('hint'), 1400));
  }

  // Tapped the wrong square: shake it and point at the right one.
  function nudge(space, wrongTile) {
    if (wrongTile) {
      wrongTile.classList.remove('wrong');
      void wrongTile.offsetWidth;
      wrongTile.classList.add('wrong');
      timers.push(setTimeout(() => wrongTile.classList.remove('wrong'), 400));
    }
    hint(space);
    armNudge();
  }

  // Point at the next square if the player hesitates.
  function armNudge() {
    clearNudge();
    nudgeTimer = setTimeout(() => {
      if (!move || over) return;
      hint(move.mode === 'ride' ? move.dest : nextStep().space);
      armNudge();
    }, 3200);
  }

  function clearNudge() { clearTimeout(nudgeTimer); nudgeTimer = 0; }

  // The computer walks its own piece, one space at a time.
  async function walk(p, steps) {
    const path = [];
    let at = p.pos;
    for (let i = 0; i < steps; i++) {
      at = at < LAST ? at + 1 : at;
      path.push(at);
    }

    const overshoot = p.pos + steps - LAST;
    if (overshoot > 0) {
      path.length = LAST - p.pos;
      let back = LAST;
      for (let i = 0; i < overshoot; i++) path.push(--back);
    }

    for (let i = 0; i < path.length; i++) {
      const space = path[i];
      p.pos = space;
      refreshTokens();
      hop(space);
      playSound('step');
      countBubble(space, i + 1);
      await sleep(190);
      if (space === LAST && overshoot <= 0) {
        refreshScores();
        return win(p);
      }
    }

    if (overshoot > 0) say(`${p.name} overshoots the summit and bounces back to ${p.pos}.`);
    refreshScores();
  }

  function win(p) {
    over = true;
    busy = true;
    spinner.disabled = true;
    refreshScores();
    say(`🏆 ${p.name} reaches the Sugar Summit and wins!`);
    playSound('win');
    winnerName.textContent = `${p.name} wins!`;
    winnerSub.textContent = p.cpu ? 'The machine takes the summit. Rematch?' : 'First to the top of the candy mountain.';
    winnerBox.hidden = false;
    confetti();
  }

  function confetti() {
    const colors = ['#ec4899', '#8b5cf6', '#38bdf8', '#34d399', '#facc15', '#fb923c'];
    for (let i = 0; i < 70; i++) {
      const bit = document.createElement('div');
      bit.className = 'confetti';
      bit.style.left = `${Math.random() * 100}vw`;
      bit.style.background = colors[i % colors.length];
      bit.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
      bit.style.animationDelay = `${Math.random() * 0.6}s`;
      document.body.appendChild(bit);
      timers.push(setTimeout(() => bit.remove(), 4200));
    }
  }

  function toSetup() {
    clearTimers();
    endMove();
    phase = 'play';
    spotlight = null;
    orderSpin = null;
    orderRolls.clear();
    colourOpen = null;
    over = true;
    busy = false;
    winnerBox.hidden = true;
    playPanel.hidden = true;
    setupPanel.hidden = false;
    tokensLayer.textContent = '';
    players = [];
    buildSeats();        // colours changed during the game show up here
  }

  // ── Wiring ─────────────────────────────────────────────────────
  buildBoard();
  buildWheel();
  buildSeats();

  spinner.addEventListener('click', () => (phase === 'order' ? orderSpinTake() : takeTurn()));
  board.addEventListener('click', onBoardClick);

  // Riding a cane or slide: click the line itself.
  links.addEventListener('click', (e) => {
    const g = e.target.closest('.link');
    if (!g || !move || move.mode !== 'ride') return;
    if (Number(g.dataset.from) === move.p.pos) takeRide();
  });

  soundBtn.addEventListener('click', () => {
    muted = !muted;
    paintSoundBtn();
    try { localStorage.setItem('sugar-summit-muted', muted ? '1' : '0'); } catch { /* storage blocked */ }
    if (!muted) playSound('step');
  });
  paintSoundBtn();
  $('start-btn').addEventListener('click', startGame);
  $('reset-btn').addEventListener('click', toSetup);
  $('again-btn').addEventListener('click', () => { toSetup(); startGame(); });

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (/^(INPUT|TEXTAREA|BUTTON)$/.test(document.activeElement?.tagName || '')) return;
    e.preventDefault();
    if (playPanel.hidden) return;

    // Space steps the piece along when one is in hand — keyboard counting.
    if (move) {
      if (move.mode === 'count') return stepOnce();
      return takeRide();
    }
    if (spinner.disabled) return;
    if (phase === 'order') return void orderSpinTake();
    takeTurn();
  });

  window.addEventListener('resize', relayout);
  if (document.fonts?.ready) document.fonts.ready.then(relayout);
  requestAnimationFrame(relayout);
})();
