// Subsets and supersets. One chosen set class drives two views: the map of all 223 classes (the
// chosen class lights the classes inside it, blue, and the classes it sits inside, yellow), and
// below it the chosen class with the classes directly above and below it.

(() => {
  const { $, REDUCED, press, flash, playSet } = UI;
  const css = getComputedStyle(document.documentElement);
  const col = (v) => css.getPropertyValue(v).trim();
  const BLUE = col('--blue');
  const YELLOW = col('--yellow');
  const TEXT = col('--text');
  const MUTED = col('--muted');
  const BAND = col('--band');

  let sel = null;

  // ======================================================================
  // The map
  // ======================================================================

  const cv = $('cv');
  const ctx = cv.getContext('2d');
  const tip = $('tip');
  const scroller = $('scroller');

  // ---------- rows by number of notes, ordered so the lines stay short ----------

  const rows = new Map();
  for (let k = 1; k <= 12; k++) rows.set(k, LAT.classes.filter((c) => c.prime.length === k).map((c) => c.name));

  const REF = 900; // the width the ordering is worked out for
  const CAP = 64; // the most room one class gets
  const refX = new Map();
  const place = (k) => {
    const names = rows.get(k);
    const sp = Math.min(CAP, REF / names.length);
    names.forEach((n, i) => refX.set(n, (i - (names.length - 1) / 2) * sp));
  };
  const bary = (n, nbrs) => {
    const xs = [...nbrs.get(n)].map((m) => refX.get(m));
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : refX.get(n);
  };
  // Sweep up and down, each row ordered by where its neighbours sit in the next one.
  function sortRow(k, nbrs) {
    const names = rows.get(k);
    const b = new Map(names.map((n) => [n, bary(n, nbrs)]));
    names.sort((a, c) => b.get(a) - b.get(c));
    place(k);
  }
  for (let k = 1; k <= 12; k++) place(k);
  for (let it = 0; it < 8; it++) {
    for (let k = 2; k <= 12; k++) sortRow(k, LAT.children);
    for (let k = 11; k >= 1; k--) sortRow(k, LAT.parents);
  }

  // ---------- layout ----------

  const H = 560;
  const SIDE = 140; // room for the row numbers on the left
  let W = 0;
  let dpr = 1;
  const pos = new Map();
  const yOf = (k) => 32 + (12 - k) * ((H - 64) / 11);

  function layout() {
    W = Math.max(scroller.clientWidth, 980);
    dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    for (const [k, names] of rows) {
      const sp = Math.min(CAP, (W - SIDE) / names.length);
      names.forEach((n, i) => pos.set(n, { x: W / 2 + 24 + (i - (names.length - 1) / 2) * sp, y: yOf(k) }));
    }
    draw();
  }

  // ---------- state of the light ----------

  let hov = null;
  let down = new Map();
  let up = new Map();
  let t0 = 0;
  let raf = 0;
  const STEP = 70; // ms between one row of the spread and the next
  const SPAN = 12 * STEP + 300;
  const clamp = (v) => Math.max(0, Math.min(1, v));

  /** What a class is to the chosen one: which side, and how far into the spread the light has come. */
  function info(n) {
    if (!sel) return null;
    if (n === sel) return { role: 'sel', a: 1 };
    const el = performance.now() - t0;
    if (down.has(n)) return { role: 'down', a: clamp((el - down.get(n) * STEP) / 240) };
    if (up.has(n)) return { role: 'up', a: clamp((el - up.get(n) * STEP) / 240) };
    return null;
  }

  // ---------- drawing ----------

  function line(a, b) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.font = '500 14px Manrope, system-ui, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.textBaseline = 'middle';
    for (const k of rows.keys()) ctx.fillText(String(k), 22, yOf(k));

    // Every link, in one stroke.
    ctx.lineWidth = 1;
    ctx.strokeStyle = sel ? 'rgba(170,179,197,0.045)' : 'rgba(170,179,197,0.13)';
    ctx.beginPath();
    for (const [p, cs] of LAT.children) {
      for (const c of cs) {
        const A = pos.get(p);
        const B = pos.get(c);
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
      }
    }
    ctx.stroke();

    // The links on a way to or from the chosen class.
    if (sel) {
      ctx.lineWidth = 1.4;
      for (const [p, cs] of LAT.children) {
        for (const c of cs) {
          const ip = info(p);
          const ic = info(c);
          if (!ip || !ic) continue;
          const isDown = ic.role === 'down' && (ip.role === 'down' || ip.role === 'sel');
          const isUp = ip.role === 'up' && (ic.role === 'up' || ic.role === 'sel');
          if (!isDown && !isUp) continue;
          ctx.globalAlpha = Math.min(ip.a, ic.a) * (isDown ? 0.55 : 0.28);
          ctx.strokeStyle = isDown ? BLUE : YELLOW;
          line(pos.get(p), pos.get(c));
        }
      }
      ctx.globalAlpha = 1;
    }

    // The links of the class under the pointer.
    if (hov && hov !== sel) {
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(243,245,250,0.7)';
      for (const m of [...LAT.parents.get(hov), ...LAT.children.get(hov)]) line(pos.get(hov), pos.get(m));
    }

    for (const [n, p] of pos) {
      const i = info(n);
      ctx.globalAlpha = sel ? 0.3 : 0.7;
      ctx.fillStyle = MUTED;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, 7);
      ctx.fill();
      if (i && i.role !== 'sel') {
        ctx.globalAlpha = i.a;
        ctx.fillStyle = i.role === 'down' ? BLUE : YELLOW;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.6 + (1 - i.a) * 4, 0, 7);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    if (sel) {
      const p = pos.get(sel);
      ctx.fillStyle = TEXT;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, 7);
      ctx.fill();
      // Its name beside it, on a patch of the band so the lines do not cut through.
      ctx.font = '600 16px Manrope, system-ui, sans-serif';
      const w = ctx.measureText(sel).width;
      const left = p.x > W - 120;
      const x = left ? p.x - 14 - w : p.x + 14;
      const y = p.y < 60 ? p.y + 22 : p.y - 20;
      ctx.fillStyle = BAND;
      ctx.fillRect(x - 5, y - 12, w + 10, 24);
      ctx.fillStyle = TEXT;
      ctx.fillText(sel, x, y);
    }
    if (hov) {
      const p = pos.get(hov);
      ctx.strokeStyle = TEXT;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, 7);
      ctx.stroke();
    }
  }

  function tick() {
    raf = 0;
    draw();
    if (sel && performance.now() - t0 < SPAN) raf = requestAnimationFrame(tick);
  }
  const redraw = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  // ---------- pointer ----------

  function hit(e) {
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let best = null;
    let bd = 12 * 12;
    for (const [n, p] of pos) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  cv.addEventListener('mousemove', (e) => {
    const n = hit(e);
    if (n === hov) return;
    hov = n;
    cv.style.cursor = n ? 'pointer' : 'default';
    if (n) {
      const p = pos.get(n);
      tip.hidden = false;
      tip.innerHTML = `${n}<span>${LAT.prime(LAT.byName.get(n).prime)}</span>`;
      tip.style.left = p.x + 'px';
      tip.style.top = p.y - 14 + 'px';
    } else tip.hidden = true;
    redraw();
  });
  cv.addEventListener('mouseleave', () => {
    hov = null;
    tip.hidden = true;
    redraw();
  });
  cv.addEventListener('click', (e) => {
    const n = hit(e);
    if (n) choose(n);
  });

  // ======================================================================
  // The chosen class with what lies directly above and below it
  // ======================================================================

  const stage = $('stage');
  const CX = 600;
  const CY = 380;
  const UP_Y = 110;
  const DOWN_Y = 650;
  const CENTER_R = 88; // the middle clock, drawn at scale 1.75
  const LABEL_W = 150; // the left edge is kept for the row labels, so no clock reaches them
  const AREA = 1200 - 2 * LABEL_W;

  /** `count` nodes in a row centred on the page, no more than `maxSp` apart and none outside the area. */
  function spread(count, maxSp) {
    const sp = Math.min(maxSp, AREA / count);
    return { sp, at: (i) => CX + (i - (count - 1) / 2) * sp };
  }

  function edge(x0, y0, x1, y1, cls, i) {
    const my = (y0 + y1) / 2;
    return `<path class="edge ${cls}" pathLength="1" style="--i:${i}" d="M${x0} ${y0}C${x0} ${my} ${x1} ${my} ${x1} ${y1}"/>`;
  }

  function renderStage() {
    const c = LAT.byName.get(sel);
    const ups = [...LAT.parents.get(sel)].sort(LAT.byOrder);
    const downs = [...LAT.children.get(sel)].sort(LAT.byOrder);
    const row = spread(Math.max(ups.length, downs.length, 1), 128);
    const scale = Math.max(0.5, Math.min(1.05, row.sp * 0.0075));
    const r = 50 * scale;
    let edges = '';
    let nodes = '';

    for (const dir of ['up', 'down']) {
      const list = dir === 'up' ? ups : downs;
      const y = dir === 'up' ? UP_Y : DOWN_Y;
      nodes += `<text class="row-label ${dir}" x="24" y="${y + 5}">${dir === 'up' ? 'Supersets' : 'Subsets'}</text>`;
      if (!list.length) {
        nodes += `<text class="none" x="${CX}" y="${y + 5}">${dir === 'up' ? 'No supersets' : 'No subsets'}</text>`;
        continue;
      }
      const at = spread(list.length, 128).at;
      list.forEach((n, i) => {
        const x = at(i);
        const p = LAT.byName.get(n);
        edges += edge(CX, dir === 'up' ? CY - CENTER_R : CY + CENTER_R, x, dir === 'up' ? y + r : y - r, dir, i);
        // A superset shows its extra note in yellow. A subset shows this class with the missing note dashed.
        let spec;
        if (dir === 'up') {
          const emb = LAT.embed(c.prime, p.prime) || [];
          spec = { on: emb, hot: p.prime.filter((q) => !emb.includes(q)) };
        } else {
          const gone = c.prime.find((_, k) => PC.forteClass(c.prime.filter((__, j) => j !== k)).name === n);
          spec = { on: c.prime.filter((q) => q !== gone), ghost: [gone] };
        }
        nodes += `<g class="n ${dir}" tabindex="0" role="button" aria-label="${n}" data-go="${n}" transform="translate(${x.toFixed(1)} ${y})" style="--i:${i}">
          <g class="pop"><circle class="hit" r="${(r + 4).toFixed(1)}"/><g transform="scale(${scale.toFixed(3)})">${LAT.clockInner(spec)}</g>
          <text y="${(dir === 'up' ? -r - 12 : r + 24).toFixed(1)}">${n}</text></g></g>`;
      });
    }

    const center = `<g class="center"><g transform="translate(${CX} ${CY}) scale(1.75)">${LAT.clockInner({ on: c.prime })}</g></g>
      <text class="c-name" x="${CX + 120}" y="${CY - 2}">${c.name}</text>
      <text class="c-prime" x="${CX + 122}" y="${CY + 40}">${LAT.prime(c.prime)}</text>
      <foreignObject x="${CX + 118}" y="${CY + 62}" width="360" height="52">
        <div class="play">
          <button type="button" class="btn" data-play="notes"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 0.5l8 4.5-8 4.5z" fill="currentColor" /></svg>Play notes</button>
          <button type="button" class="btn" data-play="chord"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 0.5l8 4.5-8 4.5z" fill="currentColor" /></svg>Play chord</button>
        </div>
      </foreignObject>`;

    stage.innerHTML = edges + center + nodes;
  }

  stage.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-play]');
    if (btn) {
      // The prime form in the octave of middle C, each note lighting its dot on the clock as it sounds.
      press(btn);
      playSet(LAT.byName.get(sel).prime.map((pc) => 60 + pc), btn.dataset.play, (m) =>
        flash(stage.querySelector(`.center .mc-dot[data-pc="${m % 12}"]`)),
      );
      return;
    }
    const g = e.target.closest('[data-go]');
    if (g) choose(g.dataset.go);
  });
  stage.addEventListener('keydown', (e) => {
    const g = e.target.closest('[data-go]');
    if (g && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      choose(g.dataset.go);
    }
  });

  // ======================================================================
  // Choosing
  // ======================================================================

  function choose(name) {
    if (!LAT.byName.has(name) || name === sel) return;
    sel = name;
    down = LAT.below(name);
    up = LAT.above(name);
    t0 = REDUCED ? -SPAN : performance.now();
    renderStage();
    redraw();
    history.replaceState(null, '', '#' + encodeURIComponent(name));
    for (const a of document.querySelectorAll('a[data-carry]')) a.href = a.dataset.carry + '#' + encodeURIComponent(name);
  }

  $('q').addEventListener('input', (e) => {
    const c = LAT.find(e.target.value);
    if (c) choose(c.name);
  });

  // ---------- start ----------

  new ResizeObserver(layout).observe(scroller);
  layout();
  document.fonts.ready.then(draw);

  // A class or a set in the address (from another page or a shared link) is chosen first.
  let start = null;
  try {
    start = LAT.find(decodeURIComponent(location.hash.slice(1)));
  } catch {}
  choose(start ? start.name : '4-Z15');

  // On a narrow screen both views scroll sideways, so they open on the middle.
  for (const box of [scroller, document.querySelector('.stage-wrap')]) box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
})();
