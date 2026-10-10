// Home page: one piece of choreography. A set is typed into the field letter by letter, the clock
// grows with each pitch class, and when the set is complete "decoded." scrambles and settles.
// Typing in the field takes over. The drawings beside each page link are below.

(() => {
  const { $, REDUCED, svgEl, round, swap, readSet, pointOn } = UI;
  // Sets without and with inversional symmetry, alternating; the symmetric ones show their axes.
  const EXAMPLES = ['0146', '0369', '037', '02468A', '013', '0167'];
  const input = $('hero-input');
  const field = $('hero-field');
  const ghost = $('ghost');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- hero clock ----------

  const clock = UI.createClock($('hero-clock'));
  const morph = UI.createMorph(clock.addShape('shape'));

  // The symmetry axes belong to a finished set, so they are drawn only when `done`. A set typed
  // by the visitor has an unknown end, so its axes wait for the shape to land; a set in the demo
  // is known, so its axes draw in together with the shape. Two notes alone have no axes worth showing.
  function show(pcs, done = true, known = false) {
    clock.mark('on', pcs);
    morph.aim(pcs);
    swap($('h-forte'), pcs.length ? PC.forteClass(pcs).name : '');
    swap($('h-prime'), pcs.length ? round(PC.primeForm(pcs)) : '');
    clock.showAxes(done ? pcs : [], morph, known);
  }

  // ---------- "decoded." ----------

  const WORD = 'decoded.';
  const word = $('decode');
  const letters = [...WORD].map((ch) => {
    const el = document.createElement('span');
    el.className = 'ch';
    el.textContent = ch;
    return el;
  });

  // While it runs, every letter keeps the room it has in the plain word, so the scramble never
  // moves the line and the hand-over back to plain text does not move anything either. Each
  // width runs from one letter's start to the next one's, which includes the font's kerning.
  function split() {
    word.textContent = WORD;
    const text = word.firstChild;
    const range = document.createRange();
    const edges = [...WORD].map((_, i) => {
      range.setStart(text, i);
      range.setEnd(text, i + 1);
      return range.getBoundingClientRect();
    });
    word.replaceChildren(...letters);
    letters.forEach((el, i) => {
      el.className = 'ch';
      el.textContent = WORD[i];
      const next = edges[i + 1];
      el.style.width = (next ? next.left - edges[i].left : edges[i].width) + 'px';
    });
  }

  let decodeId = 0;
  /** Scramble the letters through `pool`, then settle them left to right. */
  function decode(pool, slow = false) {
    if (REDUCED) return;
    const id = ++decodeId;
    split();
    const gap = slow ? 120 : 75;
    const base = slow ? 700 : 420;
    const t0 = performance.now();
    const last = letters.map(() => 0);
    letters.forEach((el) => (el._done = false));
    const tick = (now) => {
      if (id !== decodeId) return;
      const t = now - t0;
      let busy = false;
      let marked = false;
      letters.forEach((el, i) => {
        if (t >= base + i * gap) {
          if (!el._done) {
            el._done = true;
            el.textContent = WORD[i];
            el.className = 'ch d';
          }
          return;
        }
        busy = true;
        if (now - last[i] > 55) {
          el.textContent = i === WORD.length - 1 ? '.' : pool[Math.floor(Math.random() * pool.length)];
          last[i] = now;
        }
        el.className = 'ch s' + (marked ? '' : ' next');
        marked = true;
      });
      if (busy) requestAnimationFrame(tick);
      else setTimeout(() => id === decodeId && (word.textContent = WORD), 900);
    };
    requestAnimationFrame(tick);
  }
  const ALL = [...'0123456789AB'];

  // ---------- typing ----------

  let cur = '';
  function render(last = false) {
    $('ghost-text').textContent = cur;
    show(readSet(cur).pcs, last, last);
  }
  const ghostWanted = () => input.value === '' && document.activeElement !== input;
  const syncGhost = () => (ghost.hidden = !ghostWanted());

  let run = 0;
  let firstWord = true; // the first word is already decoding from the page load
  async function loop() {
    const id = ++run;
    let step = 0;
    let first = true;
    while (id === run) {
      const target = EXAMPLES[step++ % EXAMPLES.length];
      while (cur && id === run) {
        cur = cur.slice(0, -1);
        render();
        await sleep(55);
      }
      await sleep(first ? 700 : 260);
      for (const [i, ch] of [...target].entries()) {
        if (id !== run) return;
        cur += ch;
        render(i === target.length - 1);
        await sleep(150 + Math.random() * 70);
      }
      if (id !== run) return;
      if (!firstWord) decode([...cur].concat(ALL));
      firstWord = false;
      first = false;
      await sleep(2800);
    }
  }

  if (REDUCED) {
    cur = EXAMPLES[0];
    render(true);
  } else {
    field.classList.add('js-ghost');
    input.placeholder = '';
    decode(ALL, true);
    loop();
  }
  syncGhost();

  // The field takes over from the animation while it has focus or text, and gives it back when empty.
  input.addEventListener('focus', () => {
    run++;
    syncGhost();
  });
  input.addEventListener('blur', () => {
    syncGhost();
    if (input.value === '' && !REDUCED) {
      cur = '';
      loop();
    }
  });
  UI.limitInput(input, () => {
    const s = readSet(input.value).pcs;
    run++;
    syncGhost();
    show(s);
    if (s.length) decode([...input.value].concat(ALL));
  });

  $('open').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = UI.sanitize(input.value);
    location.href = 'calculator.html' + (text ? '#' + encodeURIComponent(text) : '');
  });

  // ---------- drawings ----------
  // Each page link has a drawing that comes to life while the link is hovered or focused.

  const R = 100;
  const C = 120;
  const SLOW = 5; // how fast the drawings glide: lower is slower
  const ring = () => svgEl('circle', { cx: C, cy: C, r: R }, 'ring');
  const dotAt = (v, cls) => {
    const [cx, cy] = pointOn(v, R, C);
    return svgEl('circle', { cx, cy, r: 6 }, cls);
  };

  /** One change when the link is hovered or focused, undone when it is left. */
  function hoverTo(name, go, rest) {
    const a = document.querySelector(`[data-vis="${name}"]`).closest('a');
    for (const ev of ['mouseenter', 'focus']) a.addEventListener(ev, () => !UI.REDUCED && go());
    for (const ev of ['mouseleave', 'blur']) a.addEventListener(ev, rest);
  }

  // Calculator: the shape morphs from set to set around the clock.
  function calcDrawing(host) {
    const svg = svgEl('svg', { viewBox: '0 0 240 240' });
    svg.appendChild(ring());
    const poly = svgEl('polygon', { points: '' }, 'poly');
    svg.appendChild(poly);
    const morph = UI.createMorph(poly, R, C, SLOW);
    const dots = [...Array(12).keys()].map((pc) => {
      const [cx, cy] = pointOn(pc, R, C);
      return svgEl('circle', { cx, cy, r: 6 }, 'd');
    });
    dots.forEach((d) => svg.appendChild(d));
    host.appendChild(svg);
    const aim = (text, snap) => {
      const pcs = readSet(text).pcs;
      morph.aim(pcs, snap);
      dots.forEach((d, pc) => d.classList.toggle('on', pcs.includes(pc)));
    };
    aim(EXAMPLES[0], true);
    hoverTo('calc', () => aim(EXAMPLES[1]), () => aim(EXAMPLES[0]));
  }

  // Transformations: the set stays dotted while its image turns (Tn) and folds over (In).
    function tnDrawing(host) {
    const set = [0, 1, 4, 6];
    const svg = svgEl('svg', { viewBox: '0 0 240 240' });
    svg.appendChild(ring());
    const ghost = svgEl('polygon', { points: set.map((p) => pointOn(p, R, C).join(',')).join(' ') }, 'ghost');
    const axis = svgEl('line', { x1: C, y1: C - R - 14, x2: C, y2: C + R + 14 }, 'flip');
    const poly = svgEl('polygon', { points: '' }, 'poly');
    svg.append(ghost, axis, poly);
    const dots = set.map(() => svgEl('circle', { r: 6 }, 'dot'));
    dots.forEach((d) => svg.appendChild(d));
    host.appendChild(svg);
    const glide = UI.createGlide(poly, R, C, (angles) =>
      angles.forEach((v, i) => {
        const [x, y] = pointOn(v, R, C);
        dots[i].setAttribute('cx', x);
        dots[i].setAttribute('cy', y);
      }),
      SLOW,
    );
    const go = ([n, inv], now) => {
      glide.aim(set.map((p) => UI.mod(inv ? n - p : p + n)), now);
      axis.classList.toggle('on', Boolean(inv));
      if (inv) axis.style.transform = `rotate(${n * 15}deg)`;
    };
    go([3, 0], true);
    hoverTo('tn', () => go([6, 0]), () => go([3, 0]));
  }

  // Set classes: how many classes there are for each cardinality, 0 to 12.
  function classDrawing(host) {
    const counts = Array(13).fill(0);
    for (const sc of PC.SET_CLASSES) counts[sc.prime.length]++;
    const W = 26;
    const H = 120;
    const max = Math.max(...counts);
    const svg = svgEl('svg', { viewBox: `0 -18 ${counts.length * W} ${H + 40}` });
    counts.forEach((n, i) => {
      const h = Math.max(3, (n / max) * H);
      const x = i * W + W / 2;
      const g = svgEl('g', { style: `--i:${i}; --h:${h.toFixed(1)}` }, 'bar');
      g.appendChild(svgEl('rect', { x: x - 8, y: H - h, width: 16, height: h, rx: 2 }));
      const count = svgEl('text', { x, y: H - h - 6 }, 'cnt');
      count.textContent = n;
      const card = svgEl('text', { x, y: H + 20 }, 'card');
      card.textContent = i;
      g.append(count, card);
      svg.appendChild(g);
    });
    host.appendChild(svg);
  }

  // Subsets and supersets: a row of dots for each size of set. Hovering chooses one in the middle, and the
  // rows above light yellow and the rows below blue, spreading out from it.
  function latticeDrawing(host) {
    const counts = [1, 6, 12, 29, 38, 50, 38, 29, 12, 6, 1, 1];
    const W = 300;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} 140` });
    const FROM = 6; // the row of the chosen class
    counts.forEach((n, i) => {
      const k = i + 1;
      const sp = Math.min(9, (W - 20) / n);
      const y = 8 + (12 - k) * 11;
      for (let j = 0; j < n; j++) {
        const lit = k === FROM && j === Math.floor(n / 2) ? 'sel' : (j * 3 + k) % 3 ? (k > FROM ? 'above' : k < FROM ? 'below' : '') : '';
        const dot = svgEl('circle', { cx: W / 2 + (j - (n - 1) / 2) * sp, cy: y, r: lit === 'sel' ? 3.4 : 2 }, 'c ' + lit);
        dot.style.setProperty('--r', Math.abs(k - FROM));
        svg.appendChild(dot);
      }
    });
    host.appendChild(svg);
    hoverTo('lattice', () => svg.classList.add('lit'), () => svg.classList.remove('lit'));
  }

  calcDrawing(document.querySelector('[data-vis="calc"]'));
  tnDrawing(document.querySelector('[data-vis="tn"]'));
  classDrawing(document.querySelector('[data-vis="classes"]'));
  latticeDrawing(document.querySelector('[data-vis="lattice"]'));

  UI.reveal();
})();
