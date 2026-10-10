const test = require('node:test');
const assert = require('node:assert');
global.PC = require('../js/theory.js');
const LAT = require('../js/lattice.js');

test('every class lies inside the aggregate and contains the single note', () => {
  assert.strictEqual(LAT.below('12-1').size, 222);
  assert.strictEqual(LAT.above('1-1').size, 222);
});

test('one step is one note: a class sits one size above its subsets', () => {
  for (const c of LAT.classes) {
    for (const s of LAT.children.get(c.name)) assert.strictEqual(LAT.byName.get(s).prime.length, c.prime.length - 1);
  }
});

test('below and above agree', () => {
  for (const c of LAT.classes) {
    for (const [b, steps] of LAT.below(c.name)) {
      assert.ok(LAT.above(b).has(c.name));
      assert.strictEqual(steps, c.prime.length - LAT.byName.get(b).prime.length);
    }
  }
});

test('known containments', () => {
  assert.ok(LAT.below('6-35').has('2-2')); // the whole-tone scale holds only whole steps
  assert.ok(!LAT.below('6-35').has('2-1'));
  assert.ok(LAT.below('4-Z15').has('3-3'));
  assert.ok(LAT.above('3-12').has('6-35')); // the augmented triad lies in the whole-tone scale
});

test('find reads names and digits', () => {
  assert.strictEqual(LAT.find('4-z15').name, '4-Z15');
  assert.strictEqual(LAT.find('0146').name, '4-Z15');
  assert.strictEqual(LAT.find('4-'), null);
});

test('embed finds a copy of a set inside a larger one', () => {
  const img = LAT.embed([0, 1, 4, 6], [0, 1, 3, 4, 6, 8]);
  assert.deepStrictEqual(img, [0, 1, 4, 6]);
  assert.strictEqual(LAT.embed([0, 1, 2], [0, 4, 8]), null);
});
