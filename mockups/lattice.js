// Shared by the mockups: the set-class lattice (which class sits inside which), built on PC.
// A class A is below B when some Tn or TnI of A fits inside some member of B.

const LAT = (() => {
  const label = (pcs) => pcs.map(PC.pcLabel).join('');
  const classes = PC.SET_CLASSES.filter((c) => c.prime.length > 0);
  const byName = new Map(classes.map((c) => [c.name, c]));
  const card = (c) => c.prime.length;

  // One step down is one note removed.
  const children = new Map(classes.map((c) => [c.name, new Set()]));
  const parents = new Map(classes.map((c) => [c.name, new Set()]));
  for (const c of classes) {
    if (card(c) < 2) continue;
    for (const i of c.prime.keys()) {
      const s = PC.forteClass(c.prime.filter((_, j) => j !== i));
      children.get(c.name).add(s.name);
      parents.get(s.name).add(c.name);
    }
  }

  const memo = { down: new Map(), up: new Map() };
  /** Every class reachable by repeated steps, as name -> number of steps. */
  function reach(edges, cache, name) {
    if (cache.has(name)) return cache.get(name);
    const seen = new Map();
    let frontier = [name];
    for (let d = 1; frontier.length; d++) {
      const next = [];
      for (const n of frontier) for (const m of edges.get(n)) if (!seen.has(m)) { seen.set(m, d); next.push(m); }
      frontier = next;
    }
    cache.set(name, seen);
    return seen;
  }
  const below = (name) => reach(children, memo.down, name);
  const above = (name) => reach(parents, memo.up, name);

  /** Sort key that puts 4-3 before 4-Z15 before 5-1. */
  const order = (name) => {
    const [k, r] = name.split('-');
    return Number(k) * 100 + parseInt(r.replace('Z', ''), 10);
  };
  const byOrder = (a, b) => order(a) - order(b);

  /** A class from a Forte name (4-Z15) or from digits (0146). */
  function find(text) {
    const t = text.trim().toUpperCase();
    if (t.includes('-')) return /^\d{1,2}-Z?\d+$/.test(t) ? byName.get(t) || null : null;
    const nums = [];
    for (const ch of t) {
      if (ch >= '0' && ch <= '9') nums.push(Number(ch));
      else if (ch === 'A') nums.push(10);
      else if (ch === 'B') nums.push(11);
    }
    const pcs = PC.toPcs(nums);
    return pcs.length ? PC.forteClass(pcs) : null;
  }

  /** The first Tn or TnI of `small` that sits inside `big`, or null. */
  function embed(small, big) {
    const inBig = new Set(big);
    for (const inv of [false, true]) {
      for (let n = 0; n < 12; n++) {
        const img = inv ? PC.invert(small, n) : PC.transpose(small, n);
        if (img.every((p) => inBig.has(p))) return img;
      }
    }
    return null;
  }

  const maskCache = new Map();
  function classOfSet(pcs) {
    const key = pcs.reduce((m, p) => m | (1 << p), 0);
    let c = maskCache.get(key);
    if (!c) maskCache.set(key, (c = PC.forteClass(pcs)));
    return c;
  }

  /**
   * Every proper subset ('down') or superset ('up') of a set, grouped by class:
   * class name -> the actual pitch-class sets that make it.
   */
  function content(pcs, dir) {
    const s = PC.toPcs(pcs);
    const pool = dir === 'down' ? s : PC.complement(s);
    const out = new Map();
    const total = 1 << pool.length;
    for (let m = 1; m < total; m++) {
      if (dir === 'down' && m === total - 1) continue;
      const pick = pool.filter((_, i) => m & (1 << i));
      const set = dir === 'down' ? pick : PC.toPcs([...s, ...pick]);
      const name = classOfSet(set).name;
      if (!out.has(name)) out.set(name, []);
      out.get(name).push(set);
    }
    return out;
  }

  // ---------- clock drawing (inline SVG, -50..50) ----------

  const pos = (pc, r) => {
    const a = (pc / 12) * 2 * Math.PI - Math.PI / 2;
    return [r * Math.cos(a), r * Math.sin(a)];
  };

  /** on: blue, hot: yellow, ghost: hollow yellow. */
  function clockInner({ on = [], hot = [], ghost = [], r = 38, dot = 6, poly = true } = {}) {
    const f = (v) => v.toFixed(1);
    let out = `<circle class="mc-ring" r="${r}"/>`;
    const shape = PC.toPcs([...on, ...hot]);
    if (poly && shape.length > 1) {
      out += `<polygon class="mc-shape" points="${shape.map((p) => pos(p, r).map(f).join(',')).join(' ')}"/>`;
    }
    for (let p = 0; p < 12; p++) {
      const [x, y] = pos(p, r);
      const cls = hot.includes(p) ? 'hot' : on.includes(p) ? 'on' : ghost.includes(p) ? 'ghost' : 'off';
      out += `<circle class="mc-dot ${cls}" cx="${f(x)}" cy="${f(y)}" r="${cls === 'off' ? 2.4 : dot}"/>`;
    }
    return out;
  }
  const clock = (o, cls = '') => `<svg class="mc ${cls}" viewBox="-50 -50 100 100" aria-hidden="true">${clockInner(o)}</svg>`;

  return { label, classes, byName, children, parents, below, above, byOrder, find, embed, content, clock, clockInner, pos };
})();
