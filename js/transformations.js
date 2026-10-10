// Transformations page. The text box is the single source of truth, as on the calculator;
// the chosen n drives the two clocks, and the list of all 24 under Symmetry shows every n at once.

(() => {
  const { $, curly, round, square, tnName, tnList, swap, readSet, press, flash, playSet } = UI;
  const input = $('pcs-input');
  const DEFAULT_SET = '0146';
  let n = 3;
  let set = [];
  // What Tn and In give for the set now, so that the playback sounds what is on screen.
  const images = { t: [], i: [] };

  // ---------- the choice of n ----------

  const seg = $('n-seg');
  // One thumb glides behind the twelve values, so the choice moves from one to the next.
  seg.innerHTML =
    '<span class="thumb" aria-hidden="true"></span>' +
    [...Array(12).keys()].map((i) => `<button type="button" data-n="${i}" aria-pressed="false">${i}</button>`).join('');
  const segBtns = [...seg.querySelectorAll('button')];
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) pick(Number(b.dataset.n));
  });
  seg.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    pick(UI.mod(n + step));
    segBtns[n].focus();
  });

  // ---------- the two clocks ----------

  const makeClock = (id, label) => {
    const clock = UI.createClock($(id), { label });
    const src = UI.createGlide(clock.addShape('shape src'));
    const img = UI.createGlide(clock.addShape('shape'));
    return { clock, src, img };
  };
  const ct = makeClock('clock-t', 'Set and its transposition');
  const ci = makeClock('clock-i', 'Set and its inversion');

  function showPair(c, image, nameEl, resEl, name) {
    c.src.aim(set);
    c.img.aim(image);
    c.clock.mark('src', set);
    c.clock.mark('on', image);
    swap(nameEl, name, true);
    swap(resEl, curly(PC.toPcs(image)));
  }

  function renderPair() {
    if (!set.length) return;
    images.t = set.map((p) => UI.mod(p + n));
    images.i = set.map((p) => UI.mod(n - p));
    showPair(ct, images.t, $('name-t'), $('res-t'), tnName(n, false));
    showPair(ci, images.i, $('name-i'), $('res-i'), tnName(n, true));
    // The inversion In folds the clock over the line through n/2.
    ci.clock.drawAxes([n]);
    seg.style.setProperty('--n', n);
    segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === n)));
    rows.forEach((r, i) => r.tr.classList.toggle('sel', i === n));
  }

  function pick(next) {
    n = next;
    renderPair();
  }

  // ---------- playback ----------
  // The result sounds in the octave of middle C: one note after another, or all together.

  const CLOCKS = { t: ct.clock, i: ci.clock };

  function play(key, mode, btn) {
    if (!set.length) return;
    // The set itself sounds too, and flashes on the symmetry clock, which shows it.
    const image = key === 's' ? set : images[key];
    const nodes = (key === 's' ? sym : CLOCKS[key]).nodes;
    press(btn);
    playSet(image.map((pc) => 60 + pc), mode, (m) => flash(nodes[m % 12]));
  }

  [
    ['play-s-notes', 's', 'notes'],
    ['play-s-chord', 's', 'chord'],
    ['play-t-notes', 't', 'notes'],
    ['play-t-chord', 't', 'chord'],
    ['play-i-notes', 'i', 'notes'],
    ['play-i-chord', 'i', 'chord'],
  ].forEach(([id, key, mode]) => $(id).addEventListener('click', (e) => play(key, mode, e.currentTarget)));

  // ---------- the list of all 24 ----------

  const tbody = document.querySelector('#ttable tbody');
  const rows = [...Array(12).keys()].map((i) => {
    const tr = document.createElement('tr');
    tr.style.setProperty('--i', i);
    tr.innerHTML =
      `<th scope="row"><button type="button" class="pick">${i}</button></th>` +
      '<td><span class="v"></span><span class="note"></span></td><td><span class="v"></span><span class="note"></span></td>';
    tr.addEventListener('click', () => {
      pick(i);
      // The two clocks are what the list is about, so go back up to them.
      $('sec-ops').scrollIntoView({ behavior: UI.REDUCED ? 'auto' : 'smooth', block: 'start' });
    });
    tbody.appendChild(tr);
    const [tn, tni] = [...tr.querySelectorAll('td')];
    return { tr, cells: [tn, tni] };
  });

  function renderList() {
    const prime = PC.primeForm(set).join();
    const mine = set.join();
    PC.transformations(set).forEach((r, i) => {
      [r.t, r.ti].forEach((pcs, j) => {
        const cell = rows[i].cells[j];
        const key = pcs.join();
        const notes = [key === mine && 'set', key === prime && 'prime form'].filter(Boolean);
        swap(cell.children[0], curly(pcs));
        swap(cell.children[1], notes.join(', '));
        cell.classList.toggle('same', key === mine);
      });
    });
  }

  // ---------- symmetry ----------

  const sym = UI.createClock($('clock-s'), { label: 'Set with its axes of inversional symmetry' });
  const symMorph = UI.createMorph(sym.addShape('shape'));

  function renderSym() {
    const tn = PC.tnSymmetries(set);
    const tni = PC.tniSymmetries(set);
    swap($('s-tn'), tnList(tn, false), true);
    swap($('s-tn-n'), String(tn.length));
    swap($('s-tni'), tni.length ? tnList(tni, true) : 'none', true);
    swap($('s-tni-n'), String(tni.length));
    swap($('s-forms'), String(PC.setClassSize(set)));
    sym.mark('on', set);
    symMorph.aim(set);
    sym.showAxes(set, symMorph);
  }

  // ---------- main update ----------

  const dataSections = [...document.querySelectorAll('.data')];

  function update() {
    set = readSet(input.value).pcs;
    const empty = set.length === 0;
    document.body.classList.toggle('is-empty', empty);
    dataSections.forEach((sec) => (sec.hidden = empty));
    swap($('h-forte'), empty ? '' : PC.forteClass(set).name);
    swap($('h-normal'), empty ? '' : square(PC.normalForm(set)));
    swap($('h-prime'), empty ? '' : round(PC.primeForm(set)));
    if (!empty) {
      renderPair();
      renderList();
      renderSym();
    }
    UI.writeHash(input.value);
  }

  UI.limitInput(input, update);
  const load = () => {
    input.value = UI.readHash() || DEFAULT_SET;
    update();
  };
  window.addEventListener('hashchange', () => {
    if (UI.readHash() !== input.value.trim()) load();
  });

  UI.reveal();
  load();
  if (window.matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
})();
