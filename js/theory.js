// Pitch-class set theory (mod 12). Plain script: defines the global `PC` in the browser
// and exports it under Node (for tests). Prime form follows Forte / Straus.

const PC = (() => {
  const TABLE = typeof FORTE_TABLE !== 'undefined' ? FORTE_TABLE : require('./forte-table.js');

  const mod12 = (n) => ((n % 12) + 12) % 12;
  const toPcs = (a) => [...new Set([...a].map(mod12))].sort((x, y) => x - y);
  const transpose = (pcs, n) => toPcs(pcs.map((p) => p + n));
  const invert = (pcs, n = 0) => toPcs(pcs.map((p) => n - p));
  const complement = (pcs) => {
    const have = new Set(pcs);
    return [...Array(12).keys()].filter((p) => !have.has(p));
  };
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  // 10 and 11 are always written A and B.
  const pcLabel = (pc) => (pc < 10 ? String(pc) : pc === 10 ? 'A' : 'B');

  // ---------- normal form, prime form ----------

  const zeroed = (pcs) => pcs.map((p) => mod12(p - pcs[0]));

  // Lists that start on 0 and have equal length. Forte / Straus: compare from the right,
  // beginning at the next-to-last element; the smaller element wins.
  function compareZeroed(a, b) {
    for (let i = a.length - 2; i >= 0; i--) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  }

  function normalForm(pcs) {
    const s = toPcs(pcs);
    if (s.length <= 1) return s;
    let best = null;
    let bestZ = null;
    for (let i = 0; i < s.length; i++) {
      const rot = [...s.slice(i), ...s.slice(0, i)];
      const z = zeroed(rot);
      if (best === null) {
        best = rot;
        bestZ = z;
        continue;
      }
      const span = z[z.length - 1] - bestZ[bestZ.length - 1];
      if (span < 0 || (span === 0 && compareZeroed(z, bestZ) < 0)) {
        best = rot;
        bestZ = z;
      }
    }
    return best;
  }

  function primeForm(pcs) {
    const s = toPcs(pcs);
    if (s.length === 0) return [];
    const a = zeroed(normalForm(s));
    const b = zeroed(normalForm(invert(s)));
    return compareZeroed(a, b) <= 0 ? a : b;
  }

  // ---------- intervals ----------

  /** Every pair in the set with its mod-12 difference and interval class. */
  function intervalPairs(pcs) {
    const s = toPcs(pcs);
    const out = [];
    for (let i = 0; i < s.length; i++) {
      for (let j = i + 1; j < s.length; j++) {
        const d = mod12(s[j] - s[i]);
        out.push({ a: s[i], b: s[j], d, ic: Math.min(d, 12 - d) });
      }
    }
    return out;
  }

  function intervalVector(pcs) {
    const v = [0, 0, 0, 0, 0, 0];
    for (const p of intervalPairs(pcs)) v[p.ic - 1]++;
    return v;
  }

  // ---------- symmetry ----------

  const tnSymmetries = (pcs) => {
    const s = toPcs(pcs);
    return [...Array(12).keys()].filter((n) => same(transpose(s, n), s));
  };
  const tniSymmetries = (pcs) => {
    const s = toPcs(pcs);
    return [...Array(12).keys()].filter((n) => same(invert(s, n), s));
  };

  /** All 24 operations on a set: Tn and In for n = 0 to 11. */
  function transformations(pcs) {
    const s = toPcs(pcs);
    return [...Array(12).keys()].map((n) => ({ n, t: transpose(s, n), ti: invert(s, n) }));
  }

  /** Number of distinct sets in the set class (all Tn and In). */
  function setClassSize(pcs) {
    const s = toPcs(pcs);
    const seen = new Set();
    for (let n = 0; n < 12; n++) {
      seen.add(transpose(s, n).join(','));
      seen.add(invert(s, n).join(','));
    }
    return seen.size;
  }

  // ---------- Forte classes ----------

  const byName = new Map();
  const byPrime = new Map();
  const byIcv = new Map();
  for (const [name, primeStr] of TABLE) {
    const prime = [...primeStr].map((c) => parseInt(c, 12));
    const sc = { name, prime, icv: intervalVector(prime) };
    byName.set(name, sc);
    byPrime.set(prime.join(','), sc);
    const k = sc.icv.join(',');
    byIcv.set(k, [...(byIcv.get(k) || []), sc]);
  }
  const ALL_CLASSES = [...byName.values()];
  const EMPTY_CLASS = { name: '0-1', prime: [], icv: [0, 0, 0, 0, 0, 0] };
  // Forte's 223 classes plus the empty set: the 224 set classes.
  const SET_CLASSES = [EMPTY_CLASS, ...ALL_CLASSES];

  function forteClass(pcs) {
    const s = toPcs(pcs);
    if (s.length === 0) return EMPTY_CLASS;
    const sc = byPrime.get(primeForm(s).join(','));
    if (!sc) throw new Error('No Forte class for ' + s.join(','));
    return sc;
  }

  function zMate(sc) {
    if (!sc.name.includes('Z')) return null;
    return (byIcv.get(sc.icv.join(',')) || []).find((o) => o.name !== sc.name) || null;
  }

  /**
   * Every set class that has a member inside `pool`, with each of those members: the distinct
   * subsets of the pool, empty one included, grouped by class name. Subsets are in pitch-class
   * order, so the first of a class is the lowest.
   */
  function subsetsByClass(pool) {
    const p = toPcs(pool);
    const out = new Map();
    for (let mask = 0; mask < 1 << p.length; mask++) {
      const sub = p.filter((_, i) => (mask >> i) & 1);
      const name = forteClass(sub).name;
      if (out.has(name)) out.get(name).push(sub);
      else out.set(name, [sub]);
    }
    // Members of one class all have the same size, so comparing element by element is enough.
    const cmp = (a, b) => {
      const i = a.findIndex((x, k) => x !== b[k]);
      return i < 0 ? 0 : a[i] - b[i];
    };
    for (const subs of out.values()) subs.sort(cmp);
    return out;
  }

  return {
    mod12, toPcs, transpose, invert, complement, pcLabel,
    normalForm, primeForm, intervalPairs, intervalVector,
    tnSymmetries, tniSymmetries, setClassSize, transformations,
    forteClass, zMate, subsetsByClass, ALL_CLASSES, SET_CLASSES,
  };
})();

if (typeof module !== 'undefined') module.exports = PC;
