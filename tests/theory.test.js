// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const PC = require('../js/theory.js');

const set = (s) => [...s].map((c) => parseInt(c, 12));
const prime = (s) => PC.primeForm(set(s)).map((p) => p.toString(12)).join('');

test('transpose, invert, complement', () => {
  assert.deepEqual(PC.transpose([0, 4, 7], 5), [0, 5, 9]);
  assert.deepEqual(PC.invert([0, 4, 7], 7), [0, 3, 7]);
  assert.deepEqual(PC.complement([0, 2, 4, 5, 7, 9, 11]), [1, 3, 6, 8, 10]);
});

test('normal form', () => {
  assert.deepEqual(PC.normalForm([11, 0, 2]), [11, 0, 2]);
  assert.deepEqual(PC.normalForm([2, 7, 9]), [7, 9, 2]);
});

test('prime form matches textbook values (Forte)', () => {
  assert.equal(prime('047'), '037');
  assert.equal(prime('0146'), '0146');
  assert.equal(prime('01568'), '01568'); // 5-20
  assert.equal(prime('023679'), '023679'); // 6-Z29
  assert.equal(prime('014579'), '014579'); // 6-31
  assert.equal(prime('0125679'), '0125679'); // 7-20
  assert.equal(prime('02468a'), '02468a');
});

test('prime form is invariant under Tn and In for every subset', () => {
  for (let mask = 1; mask < 4096; mask++) {
    const s = [...Array(12).keys()].filter((i) => (mask >> i) & 1);
    const p = PC.primeForm(s).join();
    assert.equal(PC.primeForm(PC.transpose(s, 3)).join(), p);
    assert.equal(PC.primeForm(PC.invert(s, 5)).join(), p);
  }
});

test('interval vectors', () => {
  assert.deepEqual(PC.intervalVector([0, 4, 7]), [0, 0, 1, 1, 1, 0]);
  assert.deepEqual(PC.intervalVector([0, 2, 4]), [0, 2, 0, 1, 0, 0]);
  assert.deepEqual(PC.intervalVector([0, 3, 6, 9]), [0, 0, 4, 0, 0, 2]);
  assert.deepEqual(PC.intervalVector([0, 2, 4, 5, 7, 9, 11]), [2, 5, 4, 3, 6, 1]);
  assert.deepEqual(PC.intervalVector([...Array(12).keys()]), [12, 12, 12, 12, 12, 6]);
});

test('symmetry and set-class size', () => {
  assert.deepEqual(PC.tnSymmetries([0, 3, 6, 9]), [0, 3, 6, 9]);
  assert.deepEqual(PC.tnSymmetries([0, 4, 7]), [0]);
  assert.deepEqual(PC.tniSymmetries([0, 4, 7]), []);
  assert.deepEqual(PC.tniSymmetries([0, 1, 2]), [2]);
  assert.equal(PC.setClassSize([0, 4, 7]), 24);
  assert.equal(PC.setClassSize([0, 3, 6, 9]), 3);
  assert.equal(PC.setClassSize([0, 2, 4, 6, 8, 10]), 2);
});

test('Forte table', () => {
  assert.equal(PC.ALL_CLASSES.length, 223);
  const counts = {};
  for (const sc of PC.ALL_CLASSES) counts[sc.prime.length] = (counts[sc.prime.length] || 0) + 1;
  assert.deepEqual(Object.values(counts), [1, 6, 12, 29, 38, 50, 38, 29, 12, 6, 1, 1]);
  assert.equal(PC.forteClass([0, 4, 7]).name, '3-11');
  assert.equal(PC.forteClass([0, 3, 6, 9]).name, '4-28');
  assert.equal(PC.forteClass([0, 1, 4, 6]).name, '4-Z15');
  assert.equal(PC.forteClass([0, 2, 3, 6, 7, 9]).name, '6-Z29');
  assert.equal(PC.zMate(PC.forteClass([0, 1, 4, 6])).name, '4-Z29');
  assert.equal(PC.zMate(PC.forteClass([0, 4, 7])), null);
  const z = PC.ALL_CLASSES.filter((sc) => sc.name.includes('Z'));
  assert.equal(z.length, 46);
  for (const sc of PC.ALL_CLASSES) {
    const n = sc.prime.length;
    assert.equal(sc.icv.reduce((a, b) => a + b, 0), (n * (n - 1)) / 2);
  }
});

test('set classes inside a pool of notes', () => {
  // C major triad: the empty set, 3 single notes, 3 pairs and the triad itself.
  const triad = PC.subsetsByClass([0, 4, 7]);
  assert.equal([...triad.values()].reduce((n, s) => n + s.length, 0), 8);
  assert.deepEqual(triad.get('0-1'), [[]]);
  assert.deepEqual(triad.get('1-1'), [[0], [4], [7]]);
  assert.deepEqual(triad.get('2-3'), [[4, 7]]);
  assert.deepEqual(triad.get('2-4'), [[0, 4]]);
  assert.deepEqual(triad.get('2-5'), [[0, 7]]);
  assert.deepEqual(triad.get('3-11'), [[0, 4, 7]]);
  assert.equal(triad.has('3-10'), false);
  // Octaves and order do not matter: the pool is pitch classes.
  assert.deepEqual([...PC.subsetsByClass([7, 12, 4, 0, 16]).keys()], [...triad.keys()]);
  // The whole aggregate holds every class, and every form of it exactly once.
  const all = PC.subsetsByClass([...Array(12).keys()]);
  assert.equal(all.size, 224);
  for (const sc of PC.SET_CLASSES) assert.equal(all.get(sc.name).length, PC.setClassSize(sc.prime));
  // Only the empty set fits inside no notes.
  assert.deepEqual([...PC.subsetsByClass([]).keys()], ['0-1']);
});

test('224 set classes, and the transformation list', () => {
  assert.equal(PC.SET_CLASSES.length, 224);
  assert.equal(PC.SET_CLASSES[0].name, '0-1');
  assert.equal(PC.setClassSize([]), 1);
  const rows = PC.transformations([0, 4, 7]);
  assert.equal(rows.length, 12);
  assert.deepEqual(rows[5], { n: 5, t: [0, 5, 9], ti: [1, 5, 10] });
  // Symmetry from the list agrees with the symmetry functions, for every set.
  for (let mask = 1; mask < 4096; mask++) {
    const s = [...Array(12).keys()].filter((i) => (mask >> i) & 1);
    const rs = PC.transformations(s);
    const tn = rs.filter((r) => r.t.join() === s.join()).map((r) => r.n);
    const ti = rs.filter((r) => r.ti.join() === s.join()).map((r) => r.n);
    assert.deepEqual(tn, PC.tnSymmetries(s));
    assert.deepEqual(ti, PC.tniSymmetries(s));
    assert.equal(24 / (tn.length + ti.length), PC.setClassSize(s));
  }
});
