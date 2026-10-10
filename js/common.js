// Shared by every page: SVG and text helpers, the animation loop, the pitch-class clock,
// the set in the URL hash, and reveal on scroll. Needs theory.js loaded first.

const UI = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const svgEl = (tag, attrs = {}, cls = '') => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (cls) e.setAttribute('class', cls);
    return e;
  };

  // ---------- text ----------

  const lab = PC.pcLabel;
  const list = (pcs) => pcs.map(lab).join('');
  const curly = (pcs) => '{' + list(pcs) + '}';
  const square = (pcs) => '[' + list(pcs) + ']';
  const round = (pcs) => '(' + list(pcs) + ')';
  const icvText = (v) => '⟨' + (v.some((x) => x > 9) ? v.join(',') : v.join('')) + '⟩';
  // An operation with its number as a subscript: T6, and I6 for the inversion.
  const tnName = (n, inv) => (inv ? `I<sub>${n}</sub>` : `T<sub>${n}</sub>`);
  const tnList = (ns, inv) => ns.map((n) => tnName(n, inv)).join(', ');

  /** Read the text as pitch classes, in the order typed: each digit is one, and A and B are 10 and 11. */
  function readSet(text) {
    const nums = [];
    for (const ch of text.toUpperCase()) {
      if (ch >= '0' && ch <= '9') nums.push(Number(ch));
      else if (ch === 'A') nums.push(10);
      else if (ch === 'B') nums.push(11);
    }
    return { nums, pcs: PC.toPcs(nums) };
  }

  /** Digits and A or B only. */
  const sanitize = (v) => v.replace(/[^0-9abAB]/g, '').toUpperCase();

  /** Keep a text box to digits, A and B as they are typed, with the cursor where it was. */
  function limitInput(input, onChange) {
    input.addEventListener('input', () => {
      const clean = sanitize(input.value);
      if (clean !== input.value) {
        const pos = input.selectionStart - (input.value.length - clean.length);
        input.value = clean;
        input.setSelectionRange(pos, pos);
      }
      onChange();
    });
  }

  // ---------- sound ----------
  // One struck-piano-string voice for every page. Each playback has a bus of its own, so a new one
  // can cut the last one off without a click.

  let ctx = null;
  let master = null;
  let noise = null;

  /** Run `fn` once the audio clock is going. Some browsers only start it a moment after the click. */
  function whenRunning(fn) {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.7;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
      // A little of the room around the piano, mixed in beside the dry sound.
      const room = ctx.createConvolver();
      room.buffer = makeRoom();
      const wet = ctx.createGain();
      wet.gain.value = 0.1;
      master.connect(room);
      room.connect(wet);
      wet.connect(comp);
      noise = makeNoise();
    }
    // The first press waits for the recordings, but never for more than a few seconds.
    const go = () => Promise.race([ready, new Promise((r) => setTimeout(r, 4000))]).then(fn);
    if (ctx.state === 'running') go();
    else ctx.resume().then(go, () => {});
  }

  // Pressing down comes a moment before the click, which is time enough to build the audio graph.
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(ev, () => whenRunning(() => {}), { once: true, capture: true, passive: true });
  }

  /** The audio clock, in seconds. Only meaningful inside `whenRunning`. */
  const now = () => ctx.currentTime;

  function newBus() {
    const g = ctx.createGain();
    g.connect(master);
    g.users = 0; // oscillators still sounding into it
    return g;
  }

  /** A second of white noise, shared by every hammer strike. */
  function makeNoise() {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** A small room: noise that fades out, darkened by a one-pole low-pass, different in each ear. */
  function makeRoom() {
    const len = Math.floor(ctx.sampleRate * 1.5);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += 0.35 * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.pow(1 - i / len, 3);
      }
    }
    return buf;
  }

  /** Inharmonicity coefficient B: stiff short treble strings are far sharper than long bass ones. */
  const inharmonicity = (midi) => Math.min(0.02, 3e-4 * Math.pow(2, (midi - 60) / 14));

  /** Level of partial n for a hammer striking 1/8 along the string: that spot weakens partial 8. */
  const partialLevel = (n) => (0.25 + 0.75 * Math.abs(Math.sin((n * Math.PI) / 8))) * Math.pow(n, -1.1) * Math.exp(-0.06 * n);

  /**
   * The fallback voice, for before the samples have loaded or when they cannot be fetched: a struck
   * piano string, built from its partials. Each partial sits a little sharp of the harmonic
   * (stiffness), decays at its own rate (higher ones faster) in two stages (a prompt sound, then a
   * long tail), and the lowest ones are two detuned strings that beat. A burst of noise is the
   * hammer; the key lifting at `dur` damps the note.
   */
  function synthTone(midi, t, dur, vol, dest) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const B = inharmonicity(midi);
    // How long the fundamental rings: bass strings sing for seconds, treble ones die quickly.
    const ring = Math.min(3, Math.max(0.4, 1.6 * Math.pow(2, -(midi - 60) / 20)));

    const damper = ctx.createGain();
    damper.gain.setValueAtTime(1, t);
    damper.gain.setTargetAtTime(0, t + dur, 0.07);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.5, Math.min(0.5, (midi - 66) / 50));
    damper.connect(pan);
    pan.connect(dest);

    // Partials stop where the sound would be too high to matter.
    const parts = [];
    for (let n = 1; n < 20; n++) {
      const fn = n * f * Math.sqrt(1 + B * n * n);
      if (fn > 6500) break;
      parts.push({ n, fn, a: partialLevel(n) });
    }
    const norm = 1 / Math.sqrt(parts.reduce((s, p) => s + p.a * p.a, 0));
    const end = t + dur + 0.7;
    const sound = (src) => {
      dest.users++;
      src.start(t);
      src.stop(end);
      // The bus is dropped once the last source into it has ended.
      src.onended = () => --dest.users || dest.disconnect();
    };
    /** `src` through its own gain, which jumps up with the strike and then dies away with time constant `tau`. */
    const voice = (src, amp, tau) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.003);
      g.gain.setTargetAtTime(0, t + 0.003, tau);
      src.connect(g);
      g.connect(damper);
    };

    for (const { n, fn, a } of parts) {
      const amp = vol * norm * a;
      const base = ring / (1 + 0.5 * (n - 1));
      const fast = [amp * 0.65, base * 0.9];
      const slow = [amp * 0.35, base * 3.5];
      const strings = n <= 5 ? 2 : 1;
      const spread = 1 + Math.random() * 1.5; // cents between the strings
      for (let s = 0; s < strings; s++) {
        const o = ctx.createOscillator();
        o.frequency.value = fn;
        // Two strings are tuned a hair apart; a single one keeps its pitch.
        if (strings === 2) o.detune.value = (s ? 1 : -1) * spread;
        // Two strings: one carries the prompt sound and the other the tail. One string carries both.
        for (const [lv, tau] of strings === 2 ? [s ? slow : fast] : [fast, slow]) voice(o, lv, tau);
        sound(o);
      }
    }

    // The hammer: a short knock of mid-high noise, and a duller thud from the case.
    const knock = [[Math.min(3500, Math.max(600, f * 3)), 0.7, 0.9, 0.012], [180, 0.6, 0.5, 0.05]];
    for (const [freq, q, level, tau] of knock) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q;
      src.connect(bp);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * level * 0.35, t + 0.002);
      g.gain.setTargetAtTime(0, t + 0.002, tau);
      bp.connect(g);
      g.connect(damper);
      src.start(t, Math.random() * 0.8);
      src.stop(t + 0.25);
      dest.users++;
      src.onended = () => --dest.users || dest.disconnect();
    }
  }

  // The Salamander Grand Piano (Alexander Holm, CC BY 3.0): a recorded note every minor third,
  // each one stretched or squeezed a little to reach the notes between.
  const SAMPLE_DIR = 'audio/salamander/';
  const samples = []; // { midi, buffer, norm }, in the order they arrive

  /** What brings the loudest moment of the first half second of a recording up to 1, so every register plays at the same level. */
  function normOf(buffer) {
    let peak = 0.001;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0, n = Math.min(d.length, buffer.sampleRate / 2); i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    return 1 / peak;
  }

  /** Start fetching every recording the moment the page loads, middle of the keyboard first. */
  const fetched = [];
  for (let oct = 0; oct <= 8; oct++) {
    for (const [name, pc] of Object.entries({ A: 9, C: 0, Ds: 3, Fs: 6 })) {
      const midi = 12 * (oct + 1) + pc;
      if (midi >= 21 && midi <= 108) fetched.push({ name: name + oct, midi });
    }
  }
  fetched.sort((x, y) => Math.abs(x.midi - 72) - Math.abs(y.midi - 72));

  // Decoding needs a context, but an offline one is allowed to work before any click, and the
  // buffers it makes play in the real one. So the recordings are ready before the first press.
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const decoder = OAC ? new OAC(2, 1, 44100) : null;

  const ready = decoder
    ? Promise.all(
        fetched.map(({ name, midi }) =>
          fetch(`${SAMPLE_DIR}${name}.mp3`)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
            .then((data) => decoder.decodeAudioData(data))
            .then((buffer) => samples.push({ midi, buffer, norm: normOf(buffer) }))
            .catch(() => {}), // a missing file only means the synth covers that register
        ),
      )
    : Promise.resolve();

  /** The loaded recording closest in pitch to `midi`, if one is within a major third. */
  function nearestSample(midi) {
    let best = null;
    for (const s of samples) if (!best || Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
    return best && Math.abs(best.midi - midi) <= 4 ? best : null;
  }

  /** A piano note: the nearest recording, retuned, and damped when the key lifts at `dur`. */
  function tone(midi, t, dur, vol, dest) {
    const s = nearestSample(midi);
    if (!s) return synthTone(midi, t, dur, vol, dest);
    const src = ctx.createBufferSource();
    src.buffer = s.buffer;
    src.playbackRate.value = Math.pow(2, (midi - s.midi) / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * s.norm, t);
    g.gain.setTargetAtTime(0, t + dur, 0.09);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.4, Math.min(0.4, (midi - 66) / 60));
    src.connect(g);
    g.connect(pan);
    pan.connect(dest);
    dest.users++;
    src.start(t);
    src.stop(t + dur + 0.8);
    src.onended = () => --dest.users || dest.disconnect();
  }

  /** Fade a playback's own bus to silence, then drop it. */
  function fadeOut(bus) {
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    setTimeout(() => bus.disconnect(), 500);
  }

  // One playback at a time: a new one fades the last out on its own bus, so it never clicks.
  let bus = null;
  let timers = [];

  /** Cut the playback in progress. */
  function stopSound() {
    timers.forEach(clearTimeout);
    timers = [];
    if (!bus) return;
    fadeOut(bus);
    bus = null;
  }

  /** Cut the playback in progress, then run `fn(bus, t0)` on a fresh bus. Pair visuals with `later`. */
  function play(fn) {
    whenRunning(() => {
      stopSound();
      bus = newBus();
      fn(bus, now() + 0.05);
    });
  }

  /** Run `fn` after `ms`, unless the playback is cut off first. */
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  /** Sound MIDI notes one after another or together, calling `onNote(midi)` as each one starts. */
  function playSet(notes, mode, onNote) {
    const seq = mode === 'notes';
    const vol = 0.34 / Math.sqrt(notes.length);
    play((b, t0) =>
      notes.forEach((m, i) => {
        const at = seq ? i * 0.4 : 0;
        tone(m, t0 + at, seq ? 1.6 : 2.4, vol, b);
        later(() => onNote(m), 50 + at * 1000);
      }),
    );
  }

  /** A brief yellow flash on a button, restarted on every press. */
  function press(btn) {
    btn.classList.remove('press');
    void btn.offsetWidth;
    btn.classList.add('press');
  }

  /** Light a clock node or key for a moment, restarted on every call. */
  function flash(el) {
    clearTimeout(el._ping);
    el.classList.remove('ping');
    void el.getBoundingClientRect();
    el.classList.add('ping');
    el._ping = setTimeout(() => el.classList.remove('ping'), 650);
  }

  // ---------- the set in the URL ----------

  const readHash = () => {
    try {
      return sanitize(decodeURIComponent(location.hash.slice(1))).trim();
    } catch {
      return '';
    }
  };

  /** Write the set into the address, and into every link that carries it to another page. */
  function writeHash(text) {
    const h = text.trim();
    history.replaceState(null, '', h ? '#' + encodeURIComponent(h) : location.pathname + location.search);
    for (const a of document.querySelectorAll('a[data-carry]')) a.href = a.dataset.carry + (h ? '#' + encodeURIComponent(h) : '');
  }

  // ---------- motion ----------

  /** Set an element's text, replaying a short entrance when the text actually changed. */
  function swap(el, value, html = false) {
    const v = String(value);
    if ((el._v ?? el.textContent) === v) return;
    el._v = v;
    if (html) el.innerHTML = v;
    else el.textContent = v;
    if (REDUCED) return;
    el.classList.remove('tick');
    void el.offsetWidth;
    el.classList.add('tick');
  }

  /** One animation loop drives every tween. A ticker returns true while it still has work to do. */
  const tickers = new Set();
  let raf = 0;
  let lastT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    for (const fn of [...tickers]) if (!fn(dt)) tickers.delete(fn);
    raf = tickers.size ? requestAnimationFrame(frame) : 0;
  }
  function run(fn) {
    tickers.add(fn);
    if (!raf) {
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  const mod = PC.mod12;
  const wrap = (d) => mod(d + 6) - 6;
  const SMOOTH = 7;

  function reveal() {
    const els = [...document.querySelectorAll('[data-reveal]')];
    if ('IntersectionObserver' in window && !REDUCED) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        },
        { threshold: 0.12 },
      );
      els.forEach((el) => io.observe(el));
    } else els.forEach((el) => el.classList.add('in'));
  }

  // ---------- the clock ----------

  const CLOCK = 520;
  const CC = CLOCK / 2;
  const CR = 196;

  /** The point for pitch class `v` on a circle, 12 to a turn, 0 at the top. */
  function pointOn(v, r, c) {
    const a = (v / 12) * 2 * Math.PI - Math.PI / 2;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  }

  const polyPoints = (angles, r, c) => angles.map((v) => pointOn(v, r, c).map((x) => x.toFixed(1)).join(',')).join(' ');

  /**
   * A shape with 12 vertices that move along a circle. Every vertex that is not in the set
   * collapses onto the nearest selected pitch class before it, so the shape can change its number
   * of corners and still morph continuously.
   */
  function createMorph(poly, r = CR, c = CC, speed = SMOOTH) {
    const m = { on: false, a: Array(12).fill(0), t: Array(12).fill(0), onSettle: null };
    const draw = () => poly.setAttribute('points', polyPoints(m.a, r, c));
    /** Is any vertex still visibly on its way? Under 0.04 of a semitone is a pixel or so. */
    m.moving = () => m.t.some((v, i) => Math.abs(wrap(v - m.a[i])) >= 0.04);
    /** Seconds until the shape is visibly still, known in advance because the glide is exponential. */
    m.settleTime = () => Math.max(0, ...m.t.map((v, i) => Math.log(Math.abs(wrap(v - m.a[i])) / 0.04) / speed));
    const step = (dt) => {
      const f = 1 - Math.exp(-dt * speed);
      let busy = false;
      for (let i = 0; i < 12; i++) {
        const d = wrap(m.t[i] - m.a[i]);
        if (Math.abs(d) < 0.003) m.a[i] = m.t[i];
        else {
          m.a[i] = mod(m.a[i] + d * f);
          busy = true;
        }
      }
      draw();
      if (m.onSettle && !m.moving()) {
        const fn = m.onSettle;
        m.onSettle = null;
        fn();
      }
      return busy;
    };
    /** The selected pitch classes on either side of `p`, and how far each is round the circle. */
    const neighbours = (sel, p) => {
      let back = 1;
      while (!sel.has(mod(p - back))) back++;
      let ahead = 1;
      while (!sel.has(mod(p + ahead))) ahead++;
      return { back, ahead };
    };
    m.sel = new Set();
    m.aim = (pcs, snap = false) => {
      if (!pcs.length) {
        m.on = false;
        m.sel = new Set();
        poly.classList.remove('show');
        return;
      }
      const sel = new Set(pcs);
      const old = m.sel;
      const fresh = m.on && !REDUCED && !snap;
      for (let i = 0; i < 12; i++) {
        let j = i;
        while (!sel.has(j)) j = (j + 11) % 12;
        m.t[i] = j;
      }
      if (fresh && old.size) {
        // A corner should travel to or from its nearer neighbour, not all the way round the gap.
        // The unselected vertices sitting on a corner move with it, so the whole group is
        // re-seated: invisibly before it grows, or by retargeting before it shrinks.
        for (const p of sel) {
          if (old.has(p)) continue;
          const { back, ahead } = neighbours(old, p);
          if (ahead >= back) continue;
          const from = mod(p - back);
          const to = mod(p + ahead);
          const group = Array.from({ length: ahead }, (_, k) => mod(p + k));
          if (group.every((i) => Math.abs(wrap(m.a[i] - m.a[from])) < 0.05)) group.forEach((i) => (m.a[i] = m.a[to]));
        }
        for (const p of old) {
          if (sel.has(p)) continue;
          const { back, ahead } = neighbours(sel, p);
          if (ahead >= back) continue;
          // Every vertex from p up to the next corner that stays now heads for that corner.
          for (let k = 0; k < ahead; k++) m.t[mod(p + k)] = mod(p + ahead);
        }
      }
      m.sel = sel;
      if (!m.on) {
        // Appearing: grow out of a single point.
        m.on = true;
        m.a.fill(m.t[pcs[0]]);
        draw();
        poly.classList.add('show');
      }
      if (REDUCED || snap) {
        m.a = m.t.slice();
        draw();
      } else run(step);
    };
    return m;
  }

  /**
   * A shape with one vertex per pitch class, each moving to its new place by the shorter way
   * round. A transposed copy of a set turns, and an inverted one folds over, with no vertex
   * changing neighbours.
   */
  function createGlide(poly, r = CR, c = CC, onDraw = null, speed = SMOOTH) {
    const g = { a: [], t: [] };
    const draw = () => {
      poly.setAttribute('points', polyPoints(g.a, r, c));
      poly.classList.toggle('show', g.a.length > 0);
      if (onDraw) onDraw(g.a);
    };
    const step = (dt) => {
      const f = 1 - Math.exp(-dt * speed);
      let busy = false;
      for (let i = 0; i < g.a.length; i++) {
        const d = wrap(g.t[i] - g.a[i]);
        if (Math.abs(d) < 0.003) g.a[i] = g.t[i];
        else {
          g.a[i] = mod(g.a[i] + d * f);
          busy = true;
        }
      }
      draw();
      return busy;
    };
    /** `pcs[i]` is where vertex i goes. A different number of vertices replaces the shape at once. */
    g.aim = (pcs, now = false) => {
      const snap = REDUCED || now || pcs.length !== g.a.length;
      g.t = pcs.slice();
      if (snap) {
        g.a = pcs.slice();
        draw();
      } else run(step);
    };
    return g;
  }

  /**
   * The ring of twelve pitch-class nodes. With `onToggle` the nodes are buttons; without it they
   * only show. `addShape` puts a polygon under the nodes, `axes` is a layer for symmetry lines.
   */
  function createClock(host, { onToggle = null, label = 'Pitch-class clock face' } = {}) {
    const svg = svgEl('svg', { viewBox: `0 0 ${CLOCK} ${CLOCK}`, role: onToggle ? 'group' : 'img', 'aria-label': label });
    svg.appendChild(svgEl('circle', { cx: CC, cy: CC, r: CR, pathLength: 1 }, 'ring'));
    const axes = svgEl('g');
    const shapes = svgEl('g');
    svg.append(axes, shapes);
    const nodes = [];
    for (let pc = 0; pc < 12; pc++) {
      const [x, y] = pointOn(pc, CR, CC);
      const attrs = onToggle ? { tabindex: 0, role: 'button', 'aria-pressed': 'false', 'aria-label': 'pitch class ' + lab(pc) } : {};
      const g = svgEl('g', attrs, 'node');
      g.style.setProperty('--i', pc);
      const bubble = svgEl('g', {}, 'bubble');
      bubble.appendChild(svgEl('circle', { cx: x, cy: y, r: 22 }));
      const t = svgEl('text', { x, y: y + 1, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
      t.textContent = lab(pc);
      bubble.appendChild(t);
      g.appendChild(bubble);
      if (onToggle) {
        g.addEventListener('click', () => onToggle(pc));
        g.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle(pc);
          }
        });
      }
      svg.appendChild(g);
      nodes.push(g);
    }
    host.classList.toggle('static', !onToggle);
    host.appendChild(svg);

    let axisKey = '';

    return {
      svg,
      nodes,
      axes,
      /**
       * The axes go away at once when the set changes. With `known` (the set is a final answer, so
       * the shape's journey is known) they draw in over exactly the time the shape needs to land,
       * and finish with it. Otherwise they wait until the shape has landed, so a set that is only
       * on the way to another one never shows axes that do not belong to it.
       * One or two notes have only trivial axes, so none are drawn for them.
       */
      showAxes(pcs, morph, known = false) {
        const ns = pcs.length >= 3 ? PC.tniSymmetries(pcs) : [];
        const key = ns.join();
        morph.onSettle = null;
        if (key === axisKey) return;
        axes.replaceChildren();
        axisKey = '';
        if (!ns.length) return;
        if (!morph.moving()) this.drawAxes(ns);
        else if (known) this.drawAxes(ns, Math.min(1.2, Math.max(0.25, morph.settleTime())));
        else morph.onSettle = () => this.drawAxes(ns);
      },
      addShape(cls = 'shape') {
        const p = svgEl('polygon', { points: '' }, cls);
        shapes.appendChild(p);
        return p;
      },
      /** Give the class `cls` to the nodes in `pcs` and take it from the others. */
      mark(cls, pcs) {
        const on = new Set(pcs);
        nodes.forEach((g, pc) => g.classList.toggle(cls, on.has(pc)));
        if (cls === 'on' && onToggle) nodes.forEach((g, pc) => g.setAttribute('aria-pressed', String(on.has(pc))));
      },
      /**
       * A line for each axis of inversional symmetry. In maps p to n - p, which fixes the point
       * n/2 on the clock, so the axis runs through that point and the opposite one.
       */
      drawAxes(ns, seconds = 0.45) {
        axisKey = ns.join();
        axes.replaceChildren();
        for (const n of ns) {
          const [x1, y1] = pointOn(n / 2, CR + 40, CC);
          const [x2, y2] = pointOn(n / 2 + 6, CR + 40, CC);
          const line = svgEl('line', { x1, y1, x2, y2, pathLength: 1 }, 'axis');
          line.style.animationDuration = seconds + 's';
          axes.appendChild(line);
        }
      },
    };
  }

  // ---------- the keyboard: four octaves, C3 to B6 ----------

  const KEY_LO = 48;
  const KEY_HI = 95;
  const KEY_HOME = 60;
  const WHITE_KEYS = 28;
  const BLACK = new Set([1, 3, 6, 8, 10]);
  const narrow = window.matchMedia('(max-width: 600px)');
  const tablet = window.matchMedia('(max-width: 900px)');

  /**
   * A piano keyboard that fills `host` (a scrolling box): as wide as it can be, but each white key
   * between 20 and 56px (38 to 56 on a phone, 30 to 56 on a tablet, where the keyboard scrolls). `height(w)` gives the key height for a white key `w` wide. The keyboard
   * only reports presses to `onPress(midi)`; what a press means is up to the page. The page keeps
   * the keys that are down in `kb.on` and calls `kb.paint()`; `kb.mark(cls, midis)` gives the class
   * `cls` to some other keys. A host that is hidden gets its keys when it is shown.
   */
  function createKeyboard(host, { height, onPress, label = 'Piano keyboard. Left and right arrows move, Enter adds or removes the key.' }) {
    const els = new Map();
    const marks = new Map([['on', new Set()]]);
    let svg = null;
    let width = 0;
    let tall = 0;
    let cursor = KEY_HOME;

    const markCursor = () => {
      for (const [m, g] of els) g.classList.toggle('cursor', m === cursor);
    };

    function paint() {
      for (const [m, g] of els) for (const [cls, set] of marks) g.classList.toggle(cls, set.has(m));
    }

    function build(ww) {
      const WH = height(ww);
      const BH = Math.round(WH * 0.62);
      const BW = Math.round(ww * 0.62);
      const geo = {};
      els.clear();
      let wi = 0;
      for (let m = KEY_LO; m <= KEY_HI; m++) {
        if (BLACK.has(m % 12)) geo[m] = { x: wi * ww - BW / 2, w: BW, h: BH, black: true };
        else geo[m] = { x: wi * ww, w: ww, h: WH, black: false, i: wi++ };
      }
      const total = wi * ww;
      const hadFocus = svg && document.activeElement === svg;
      const next = svgEl('svg', { width: total, height: WH, viewBox: `0 0 ${total} ${WH}`, tabindex: 0, role: 'group', 'aria-label': label }, 'kb');

      const makeKey = (m) => {
        const k = geo[m];
        const g = svgEl('g', { 'data-midi': m }, 'key ' + (k.black ? 'black' : 'white'));
        g.appendChild(svgEl('rect', { x: k.x + 0.5, y: 0.5, width: k.w - 1, height: k.h - 1, rx: 3 }));
        const text = svgEl('text', { x: k.x + k.w / 2, y: k.h - 10 }, 'klab');
        text.textContent = lab(m % 12);
        g.appendChild(text);
        els.set(m, g);
        return g;
      };
      for (let m = KEY_LO; m <= KEY_HI; m++) if (!geo[m].black) next.appendChild(makeKey(m));
      for (let m = KEY_LO; m <= KEY_HI; m++) if (geo[m].black) next.appendChild(makeKey(m));

      next.addEventListener('click', (e) => {
        const g = e.target.closest('[data-midi]');
        if (!g) return;
        cursor = Number(g.dataset.midi);
        markCursor();
        onPress(cursor);
      });
      next.addEventListener('keydown', (e) => {
        const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (step) {
          e.preventDefault();
          cursor = Math.min(KEY_HI, Math.max(KEY_LO, cursor + step * (e.shiftKey ? 12 : 1)));
          markCursor();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPress(cursor);
        }
      });

      const scrolled = host.scrollLeft;
      const first = !svg;
      if (svg) svg.replaceWith(next);
      else host.appendChild(next);
      // First time on a keyboard that scrolls: show the octave of middle C, where a set starts.
      if (first) host.scrollLeft = Math.max(0, 10.5 * ww - host.clientWidth / 2);
      else host.scrollLeft = scrolled;
      svg = next;
      width = ww;
      tall = WH;
      markCursor();
      paint();
      if (hadFocus) next.focus({ preventScroll: true });
    }

    function fit() {
      const avail = host.clientWidth;
      if (!avail) return;
      // On a phone or tablet the keys stay wide enough for a finger, and the keyboard scrolls.
      const least = narrow.matches ? 38 : tablet.matches ? 30 : 20;
      const ww = Math.min(56, Math.max(least, Math.floor((avail / WHITE_KEYS) * 10) / 10));
      if (!svg || Math.abs(ww - width) > 0.3 || height(ww) !== tall) build(ww);
    }

    fit();
    new ResizeObserver(fit).observe(host);
    window.addEventListener('resize', fit);
    if (document.fonts) document.fonts.ready.then(fit);

    return {
      LO: KEY_LO,
      HI: KEY_HI,
      HOME: KEY_HOME,
      els,
      on: marks.get('on'),
      fit,
      paint,
      /** Give the class `cls` to exactly the keys in `midis`, and take it from the others. */
      mark(cls, midis) {
        marks.set(cls, midis);
        paint();
      },
    };
  }

  return {
    NS, $, REDUCED, svgEl, lab, list, curly, square, round, icvText, tnName, tnList,
    whenRunning, now, newBus, tone, playSet, play, later, press, flash,
    readSet, sanitize, limitInput, readHash, writeHash, swap, run, mod, wrap, reveal,
    CLOCK, CC, CR, pointOn, createMorph, createGlide, createClock, createKeyboard,
  };
})();
