// The set-class lattice, for the Subsets and supersets page. Needs theory.js loaded first.
// A class A sits below B when some Tn or TnI of A fits inside a member of B. One step down is one
// note taken away, so the lattice is built from those single steps.

const LAT = (() => {
  const label = (pcs) => pcs.map(PC.pcLabel).join('');
  /** A prime form the way every other page writes it: (0146). */
  const prime = (pcs) => '(' + label(pcs) + ')';
  const classes = PC.SET_CLASSES.filter((c) => c.prime.length > 0);
  const byName = new Map(classes.map((c) => [c.name, c]));

  const children = new Map(classes.map((c) => [c.name, new Set()]));
  const parents = new Map(classes.map((c) => [c.name, new Set()]));
  for (const c of classes) {
    if (c.prime.length < 2) continue;
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

  /** A class from a Forte name (4-Z15) or from digits (0146), or null. */
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

  // ---------- small clocks, as markup for inline SVG (a -50..50 box) ----------

  const pos = (pc, r) => {
    const a = (pc / 12) * 2 * Math.PI - Math.PI / 2;
    return [r * Math.cos(a), r * Math.sin(a)];
  };

  /** `on` are blue, `hot` yellow, `ghost` a dashed yellow outline. */
  function clockInner({ on = [], hot = [], ghost = [], r = 38, dot = 6 } = {}) {
    const f = (v) => v.toFixed(1);
    let out = `<circle class="mc-ring" r="${r}"/>`;
    const shape = PC.toPcs([...on, ...hot]);
    if (shape.length > 1) out += `<polygon class="mc-shape" points="${shape.map((p) => pos(p, r).map(f).join(',')).join(' ')}"/>`;
    for (let p = 0; p < 12; p++) {
      const [x, y] = pos(p, r);
      const cls = hot.includes(p) ? 'hot' : on.includes(p) ? 'on' : ghost.includes(p) ? 'ghost' : 'off';
      out += `<circle class="mc-dot ${cls}" data-pc="${p}" cx="${f(x)}" cy="${f(y)}" r="${cls === 'off' ? 2.4 : dot}"/>`;
    }
    return out;
  }
  const clock = (o) => `<svg class="mc" viewBox="-50 -50 100 100" aria-hidden="true">${clockInner(o)}</svg>`;

  return { label, prime, classes, byName, children, parents, below, above, byOrder, find, embed, clock, clockInner };
})();

if (typeof module !== 'undefined') module.exports = LAT;
