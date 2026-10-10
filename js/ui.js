// Interface for the pitch-class set calculator. The text box is the single source of truth:
// the clock and keyboard edit the text, and everything else is derived from reading it.
// Input is digits only and needs no spaces: "0146" is 0 1 4 6, and "10" and "11" are read whole.

(() => {
  const { $, svgEl, lab, list, curly, square, round, tnList, readSet, swap, mod, pointOn, press, flash, tone, newBus, whenRunning, now, playSet, play, later } = UI;
  const input = $('pcs-input');
  const DEFAULT_SET = '0146';

  let parsed = readSet('');
  let morph = null;

  // ---------- sound ----------

  function ping(midi) {
    for (const el of [kb.els.get(midi), clockNodes[midi % 12]]) if (el) flash(el);
  }

  const clearHits = () => document.querySelectorAll('.chord.hit').forEach((c) => c.classList.remove('hit'));

  /** Play the keys that are pressed, in the octaves they sit in: one after another, or together. */
  function playback(mode) {
    if (!pressed.size) return;
    press($(mode === 'notes' ? 'play-notes' : 'play-chord'));
    clearHits();
    playSet([...pressed].sort((a, b) => a - b), mode, ping);
  }

  function preview(midi) {
    ping(midi);
    whenRunning(() => tone(midi, now() + 0.01, 1.2, 0.3, newBus()));
  }

  /**
   * Sound every pair of keys that makes one interval class, one pair after another, two notes
   * together, at the octaves they sit in on the piano. A pitch class pressed in two octaves is two
   * keys, so each of them pairs up.
   */
  function playInterval(ic) {
    const keys = [...pressed].sort((a, b) => a - b);
    const pairs = [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const d = mod(keys[j] - keys[i]);
        if (Math.min(d, 12 - d) === ic) pairs.push([keys[i], keys[j]]);
      }
    }
    if (!pairs.length) return;
    clearHits();
    play((b, t0) =>
      pairs.forEach(([lo, hi], i) => {
        const at = i * 0.75;
        tone(lo, t0 + at, 1.1, 0.3, b);
        tone(hi, t0 + at, 1.1, 0.3, b);
        const [x, y] = [lo % 12, hi % 12].sort((m, n) => m - n);
        const chord = chords.find((c) => c.a === x && c.b === y);
        later(() => {
          ping(lo);
          ping(hi);
          chord?.el.classList.add('hit');
        }, 50 + at * 1000);
        later(() => chord?.el.classList.remove('hit'), 50 + at * 1000 + 650);
      }),
    );
  }

  $('play-notes').addEventListener('click', () => playback('notes'));
  $('play-chord').addEventListener('click', () => playback('chord'));

  // ---------- editing the text from the clock / keyboard ----------

  const setInput = (nums) => {
    input.value = list(nums);
    update();
  };

  function togglePc(pc) {
    if (parsed.nums.includes(pc)) setInput(parsed.nums.filter((p) => p !== pc));
    else {
      setInput([...parsed.nums, pc]);
      preview(HOME + pc);
    }
  }

  // ---------- clock ----------

  let clock;
  let clockNodes = [];

  function buildClock() {
    clock = UI.createClock($('clock'), { onToggle: togglePc });
    clockNodes = clock.nodes;
    morph = UI.createMorph(clock.addShape('shape'));
  }

  function updateClock(pcs) {
    clock.mark('on', pcs);
    morph.aim(pcs);
    clock.showAxes(pcs, morph);
  }

  // ---------- keyboard ----------

  const HOME = 60;
  // Every key that is pressed. The same pitch class can be pressed in several octaves, and each
  // one is a separate entry in the text.
  let kb = null;
  let pressed = null;

  function pressKey(midi) {
    const pc = midi % 12;
    if (pressed.has(midi)) {
      // Take out one entry for this pitch class; any other octave of it stays.
      pressed.delete(midi);
      const at = parsed.nums.lastIndexOf(pc);
      setInput(parsed.nums.filter((_, i) => i !== at));
    } else {
      pressed.add(midi);
      setInput([...parsed.nums, pc]);
      preview(midi);
    }
  }

  // On a wide layout the keyboard takes whatever height is left below the clock and the readout,
  // so the whole thing ends at the bottom of the window. Elsewhere the keys follow their width.
  const wideLayout = window.matchMedia('(min-width: 901px)');
  function keyHeight(ww) {
    const byWidth = Math.min(165, Math.round(ww * 4.2));
    if (!wideLayout.matches) return Math.max(110, byWidth);
    const top = document.querySelector('.top');
    const field = $('pcs-input').closest('.field-wrap');
    const left = field.offsetHeight + parseFloat(getComputedStyle(field).marginTop) + document.querySelector('.summary').offsetHeight;
    const above = parseFloat(getComputedStyle(top).paddingTop) + Math.max(left, $('clock').offsetHeight);
    const room = window.innerHeight - top.offsetTop - above;
    return Math.round(Math.max(80, Math.min(165, byWidth, room)));
  }

  /** Make the pressed keys match the text: one key per entry, keeping the octaves already chosen. */
  function syncKeys(nums) {
    const need = new Map();
    for (const pc of nums) need.set(pc, (need.get(pc) || 0) + 1);
    for (let pc = 0; pc < 12; pc++) {
      const have = [...pressed].filter((m) => m % 12 === pc);
      const want = need.get(pc) || 0;
      for (const m of have.slice(want)) pressed.delete(m);
      for (let k = have.length; k < want; k++) {
        // A new entry takes the home octave first, then the nearest free octave.
        const free = [0, 12, -12, 24, -24].map((o) => HOME + pc + o).find((m) => m >= kb.LO && m <= kb.HI && !pressed.has(m));
        if (free !== undefined) pressed.add(free);
      }
    }
    kb.paint();
  }

  // ---------- summary and properties ----------

  const PROPS = [
    ['set', 'Set'],
    ['normal', 'Normal form'],
    ['comp', 'Complement'],
    ['z', 'Z-mate'],
    ['tn', 'Transposition symmetry'],
    ['tni', 'Inversion symmetry'],
    ['size', 'Unique forms in the set class'],
  ];
  const props = {};
  $('props').innerHTML =
    '<div class="prow phead" role="row"><span role="columnheader">Property</span><span role="columnheader">Value</span></div>' +
    PROPS.map(
      ([k, label], i) =>
        `<div class="prow" role="row" style="--i:${i}"><span class="pname" role="rowheader">${label}</span>` +
        `<span class="pval" role="cell"><span id="p-${k}-v"></span><span class="note" id="p-${k}-n"></span></span></div>`,
    ).join('');
  for (const [k] of PROPS) props[k] = { v: $(`p-${k}-v`), n: $(`p-${k}-n`) };

  function setProp(k, value, note = '', html = false) {
    swap(props[k].v, value, html);
    swap(props[k].n, note);
  }

  function renderResults(s) {
    if (s.length === 0) {
      swap($('forte'), '');
      swap($('prime'), '');
      for (const [k] of PROPS) setProp(k, '');
      return;
    }
    const sc = PC.forteClass(s);
    const comp = PC.complement(s);
    const z = PC.zMate(sc);
    const tn = PC.tnSymmetries(s).filter((n) => n !== 0);
    const tni = PC.tniSymmetries(s);
    swap($('forte'), sc.name);
    swap($('prime'), round(PC.primeForm(s)));
    setProp('set', curly(s));
    setProp('normal', square(PC.normalForm(s)));
    setProp('comp', curly(comp), comp.length ? `(${PC.forteClass(comp).name})` : '');
    setProp('z', z ? list(z.prime) : 'none', z ? `(${z.name})` : '');
    setProp('tn', tn.length ? tnList(tn, false) : 'none', '', true);
    setProp('tni', tni.length ? tnList(tni, true) : 'none', '', true);
    setProp('size', String(PC.setClassSize(s)));
  }

  // ---------- interval classes ----------
  // One column per class with its count. The clock beside it draws every pair as a chord in its
  // class colour; pointing at a column brings that class forward.

  const IC_R = 140;
  const IC_C = 200;
  const rows = [];
  const chords = [];
  const dots = [];
  function activateIc(ic) {
    rows.forEach((r) => r.cells.forEach((c) => c.classList.toggle('active', r.ic === ic)));
    chords.forEach((c) => {
      c.el.classList.toggle('dim', ic !== 0 && c.ic !== ic);
      c.el.classList.toggle('hl', ic !== 0 && c.ic === ic);
    });
  }

  // The interval vector, boxed: the class numbers across the top and how many pairs each has below.
  function buildIc() {
    const classes = [1, 2, 3, 4, 5, 6];
    $('ic-box').innerHTML =
      '<span class="ic-lab">Class</span>' +
      classes.map((ic) => `<span class="ic-cell ic-key" tabindex="0" data-ic="${ic}" style="--c: var(--ic${ic})">${ic}</span>`).join('') +
      '<span class="ic-lab">Count</span>' +
      classes.map((ic) => `<span class="ic-cell ic-count" data-ic="${ic}">0</span>`).join('');
    for (const ic of classes) {
      const cells = [...$('ic-box').querySelectorAll(`.ic-cell[data-ic="${ic}"]`)];
      rows.push({ ic, cells, count: cells[1] });
      for (const el of cells) {
        // Only a mouse hovers; on a touch screen the pointer "enters" at a tap and would never leave.
        el.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && activateIc(ic));
        el.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && activateIc(0));
        el.addEventListener('click', () => playInterval(ic));
      }
      cells[0].addEventListener('focus', () => activateIc(ic));
      cells[0].addEventListener('blur', () => activateIc(0));
      cells[0].addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          playInterval(ic);
        }
      });
    }

    const svg = svgEl('svg', { viewBox: '0 0 400 400', role: 'img', 'aria-label': 'Every pair in the set drawn as a chord, coloured by interval class' });
    svg.appendChild(svgEl('circle', { cx: IC_C, cy: IC_C, r: IC_R }, 'ring'));
    for (let pc = 0; pc < 12; pc++) {
      const [x, y] = pointOn(pc, IC_R + 30, IC_C);
      const t = svgEl('text', { x, y }, 'tickl');
      t.textContent = lab(pc);
      svg.appendChild(t);
    }
    for (const { a, b, ic } of PC.intervalPairs([...Array(12).keys()])) {
      const [x1, y1] = pointOn(a, IC_R, IC_C);
      const [x2, y2] = pointOn(b, IC_R, IC_C);
      const el = svgEl('line', { x1, y1, x2, y2, pathLength: 1, stroke: `var(--ic${ic})` }, 'chord');
      svg.appendChild(el);
      chords.push({ el, a, b, ic });
    }
    for (let pc = 0; pc < 12; pc++) {
      const [x, y] = pointOn(pc, IC_R, IC_C);
      const el = svgEl('circle', { cx: x, cy: y, r: 6 }, 'pt');
      svg.appendChild(el);
      dots.push(el);
    }
    $('ic-clock').appendChild(svg);

  }

  function renderIc(s) {
    const inSet = new Set(s);
    const v = PC.intervalVector(s);
    rows.forEach((r, i) => {
      swap(r.count, v[i]);
    });
    chords.forEach((c) => c.el.classList.toggle('on', inSet.has(c.a) && inSet.has(c.b)));
    dots.forEach((d, pc) => d.classList.toggle('on', inSet.has(pc)));
  }

  // ---------- main update ----------

  const dataSections = [...document.querySelectorAll('.data')];

  function update() {
    parsed = readSet(input.value);
    const s = parsed.pcs;
    const empty = s.length === 0;
    document.body.classList.toggle('is-empty', empty);
    dataSections.forEach((sec) => (sec.hidden = empty));
    updateClock(s);
    syncKeys(parsed.nums);
    renderResults(s);
    if (!empty) renderIc(s);
    UI.writeHash(input.value);
  }

  UI.limitInput(input, update);

  function loadFromHash() {
    input.value = UI.readHash() || DEFAULT_SET;
    update();
  }
  window.addEventListener('hashchange', () => {
    if (UI.readHash() !== input.value.trim()) loadFromHash();
  });

  UI.reveal();

  buildClock();
  buildIc();
  kb = UI.createKeyboard($('keys-scroll'), { height: keyHeight, onPress: pressKey });
  pressed = kb.on;
  loadFromHash();
  // The readout above the keys has its text now, and the keys take the height that is left.
  kb.fit();
  // Focus the box on desktop only; on a phone it would pop the on-screen keyboard open.
  if (window.matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
})();
