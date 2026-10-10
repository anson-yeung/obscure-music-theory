// Set-class browser: a table of all 224 classes, built once, then shown and hidden by the filters.

(() => {
  const { $, list, curly, icvText, press, flash, playSet, swap, tone, whenRunning, now, newBus } = UI;
  const q = $('q');
  const tbody = document.querySelector('#sc-table tbody');

  // ---------- the data ----------

  const items = PC.SET_CLASSES.map((sc, index) => {
    const mate = PC.zMate(sc);
    const prime = list(sc.prime);
    return {
      sc,
      index,
      card: sc.prime.length,
      prime,
      icv: sc.icv,
      z: sc.name.includes('Z'),
      mate: mate ? mate.name : '',
      forms: PC.setClassSize(sc.prime),
      // What the search box looks in: the name, the name without its hyphen, the prime form.
      haystack: [sc.name, sc.name.replace('-', ''), prime].join(' ').toLowerCase(),
    };
  });

  for (const it of items) {
    const tr = document.createElement('tr');
    tr.dataset.i = it.index;
    tr.innerHTML =
      `<td class="name"><button type="button" class="pick" aria-pressed="false">${it.sc.name}</button></td>` +
      `<td class="prime">${it.card ? it.prime : '–'}</td>` +
      `<td>${icvText(it.icv)}</td>` +
      `<td>${it.mate ? `<button type="button" class="link" data-mate="${it.mate}">${it.mate}</button>` : ''}</td>` +
      `<td class="forms">${it.forms}</td>`;
    it.tr = tr;
    it.fit = 0; // how many of its forms sit inside the chosen notes
    it.pick = tr.querySelector('.pick');
    tbody.appendChild(tr);
  }

  // ---------- the clock: stays beside the table, shows the chosen class ----------

  const clock = UI.createClock($('clock'), { label: 'Prime form of the chosen set class' });
  const morph = UI.createMorph(clock.addShape('shape'));
  const panel = document.querySelector('.panel');
  let chosen = null;

  function choose(it) {
    if (chosen) {
      chosen.tr.classList.remove('sel');
      chosen.pick.setAttribute('aria-pressed', 'false');
    }
    chosen = it;
    it.tr.classList.add('sel');
    it.pick.setAttribute('aria-pressed', 'true');
    panel.classList.toggle('is-empty', it.card === 0);
    UI.swap($('p-name'), it.sc.name);
    UI.swap($('p-prime'), it.card ? `(${it.prime})` : 'empty set');
    $('p-calc').hidden = it.card === 0;
    $('p-sub').hidden = it.card === 0;
    $('p-sub').href = `subsets-and-supersets.html#${encodeURIComponent(it.sc.name)}`;
    // Its complement is the class of the other pitch classes: 4 notes pair with 8, 3 with 9.
    const comp = items.find((i) => i.sc.name === PC.forteClass(PC.complement(it.sc.prime)).name);
    it.comp = comp;
    $('p-comp').hidden = false;
    $('p-comp').textContent = `Go to complement ${comp.sc.name}`;
    $('p-calc').href = `calculator.html#${it.prime}`;
    clock.mark('on', it.sc.prime);
    morph.aim(it.sc.prime);
    // A line through the clock for each axis of inversional symmetry, drawn in as the shape lands.
    clock.showAxes(it.sc.prime, morph, true);
    at = 0;
    renderWhere();
  }

  // ---------- playback: the prime form in the octave of middle C, or the place in the notes ----------

  function play(mode, btn) {
    if (!chosen || !chosen.card) return;
    press(btn);
    if (places.length) playSet(voice(places[at]), mode, (m) => flash(kb.els.get(m)));
    else playSet(chosen.sc.prime.map((pc) => 60 + pc), mode, (m) => flash(clock.nodes[m % 12]));
  }
  $('play-notes').addEventListener('click', (e) => play('notes', e.currentTarget));
  $('play-chord').addEventListener('click', (e) => play('chord', e.currentTarget));

  // ---------- the filters ----------

  const state = { card: 'any', icv: Array(6).fill(null), z: 'any', forms: 'any' };
  // The notes chosen on the keyboard, as pitch classes. `by` says which sets of them make each
  // class, by class name; it is null while no note is chosen, which is no limit at all.
  const pool = { pcs: [], by: null };

  // A row of choices with one thumb gliding to the chosen one, as on the transformations page.
  const makeTrack = (host, choices, key) => {
    host.style.setProperty('--cols', choices.length);
    host.style.gridTemplateColumns = choices.map(([, label]) => (typeof label === 'number' ? 'var(--num)' : 'var(--wide)')).join(' ');
    host.innerHTML =
      '<span class="thumb" aria-hidden="true"></span>' +
      choices.map(([v, label]) => `<button type="button" data-v="${v}" aria-pressed="false">${label}</button>`).join('');
    const btns = [...host.querySelectorAll('button')];
    let current = 'any';
    const show = (v) => {
      current = v;
      const on = btns.find((b) => b.dataset.v === String(v)) || btns[0];
      host.style.setProperty('--tx', on.offsetLeft - 4 + 'px');
      host.style.setProperty('--tw', on.offsetWidth + 'px');
      btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
    };
    new ResizeObserver(() => show(current)).observe(host);
    const pick = (i) => {
      const v = btns[i].dataset.v;
      state[key] = v === 'any' ? 'any' : key === 'z' ? v : Number(v);
      show(v);
      apply();
    };
    host.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) pick(btns.indexOf(b));
    });
    host.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const i = Math.min(btns.length - 1, Math.max(0, btns.findIndex((b) => b.getAttribute('aria-pressed') === 'true') + step));
      pick(i);
      btns[i].focus();
    });
    show('any');
    return { reset: () => show('any') };
  };
  const ANY = ['any', 'Any'];
  const tracks = [
    makeTrack($('f-card'), [ANY, ...[...Array(13).keys()].map((v) => [v, v])], 'card'),
    makeTrack($('f-z'), [ANY, ['z', 'Z'], ['no', 'Not Z']], 'z'),
    makeTrack($('f-forms'), [ANY, ...[...new Set(items.map((i) => i.forms))].sort((a, b) => a - b).map((v) => [v, v])], 'forms'),
  ];

  // The interval vector: six slots in one field. A digit moves on to the next slot, except a 1,
  // which waits for a second digit (10, 11, 12). A pasted vector fills the slots from the one pasted into.
  const vec = $('f-icv');
  vec.innerHTML =
    '<span class="br" aria-hidden="true">⟨</span>' +
    [1, 2, 3, 4, 5, 6]
      .map((ic) => `<label class="slot" style="--c: var(--ic${ic})"><input inputmode="numeric" maxlength="2" placeholder="–" autocomplete="off" aria-label="Interval class ${ic}" /><b>${ic}</b></label>`)
      .join('') +
    '<span class="br" aria-hidden="true">⟩</span>';
  const slots = [...vec.querySelectorAll('input')];

  function showIcv() {
    slots.forEach((el, i) => {
      const v = state.icv[i];
      if ((el.value === '' ? null : Number(el.value)) !== v) el.value = v ?? '';
      el.classList.toggle('set', v !== null);
    });
  }

  slots.forEach((el, i) => {
    const go = (to) => slots[to]?.focus();
    el.addEventListener('focus', () => el.select());
    el.addEventListener('input', () => {
      el.value = el.value.replace(/\D/g, '').slice(0, 2);
      state.icv[i] = el.value === '' ? null : Number(el.value);
      showIcv();
      apply();
      if (el.value.length === 2 || (el.value !== '' && el.value !== '1')) go(i + 1);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === ' ' || (e.key === 'ArrowRight' && el.selectionStart === el.value.length)) {
        e.preventDefault();
        go(i + 1);
      } else if (e.key === 'ArrowLeft' && el.selectionStart === 0) {
        e.preventDefault();
        go(i - 1);
      } else if (e.key === 'Backspace' && el.value === '') go(i - 1);
    });
    el.addEventListener('paste', (e) => {
      // Separated values (⟨12,10,…⟩) are read whole; a run of digits is read one digit to a slot.
      const text = e.clipboardData.getData('text') || '';
      const vals = /\d\D+\d/.test(text) ? text.match(/\d+/g) : [...text.replace(/\D/g, '')];
      if (!vals.length) return;
      e.preventDefault();
      vals.slice(0, 6 - i).forEach((v, k) => (state.icv[i + k] = Number(v.slice(0, 2))));
      showIcv();
      apply();
    });
  });

  q.addEventListener('input', apply);

  // ---------- the notes: an optional keyboard; only classes that fit inside the notes are shown ----------

  const toggle = $('notes-toggle');
  const nbody = $('notes-body');

  const kb = UI.createKeyboard($('keys-scroll'), {
    height: (ww) => Math.max(96, Math.min(132, Math.round(ww * 3.4))),
    onPress(midi) {
      if (kb.on.has(midi)) kb.on.delete(midi);
      else {
        kb.on.add(midi);
        whenRunning(() => tone(midi, now() + 0.01, 1.2, 0.3, newBus()));
      }
      readNotes();
      apply();
      renderWhere();
    },
  });

  /** Take the notes from the keys: the sets they hold, the same pitch class in other octaves, and what the page says of them. */
  function readNotes() {
    pool.pcs = PC.toPcs([...kb.on]);
    pool.by = pool.pcs.length ? PC.subsetsByClass(pool.pcs) : null;
    for (const it of items) {
      it.fit = pool.by ? (pool.by.get(it.sc.name) || []).length : 0;
    }
    swap($('npool'), pool.by ? curly(pool.pcs) : '');
    $('notes-clear').hidden = !pool.by;
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.textContent = open ? 'Hide keyboard' : pool.by ? 'Edit notes' : 'Choose notes';
  }

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    nbody.classList.toggle('open', open);
    nbody.inert = !open;
    readNotes();
    if (open) kb.fit();
  });
  $('notes-clear').addEventListener('click', () => {
    kb.on.clear();
    readNotes();
    apply();
    renderWhere();
  });

  // The chosen class inside the notes: every place it fits, as a row of buttons. The chosen place is
  // marked on the keyboard, and the play buttons sound it in the octaves of the keys that were chosen.
  let places = [];
  let at = 0;
  const wlist = $('w-list');

  /** The keys of a place: the chosen keys, each in its own octave, that are one of its pitch classes. */
  const voice = (pcs) => [...kb.on].filter((m) => pcs.includes(m % 12)).sort((a, b) => a - b);

  function markPlace() {
    [...wlist.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === at)));
    kb.mark('hit', new Set(places.length ? voice(places[at]) : []));
  }

  function renderWhere() {
    const live = chosen !== null && chosen.card > 0 && pool.by !== null;
    // The place that was chosen stays chosen when the notes change, if it still fits.
    const kept = places[at]?.join();
    places = live ? pool.by.get(chosen.sc.name) || [] : [];
    at = Math.max(0, places.findIndex((p) => p.join() === kept));
    $('where').hidden = !live;
    wlist.hidden = places.length === 0;
    swap($('w-label'), places.length === 1 ? '1 option:' : `${places.length} options:`);
    wlist.innerHTML = places.map((p) => `<button type="button" aria-pressed="false">${curly(p)}</button>`).join('');
    markPlace();
  }
  wlist.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    at = [...wlist.children].indexOf(b);
    markPlace();
  });

  function active() {
    return q.value.trim() !== '' || state.card !== 'any' || state.icv.some((v) => v !== null) || state.z !== 'any' || state.forms !== 'any' || pool.by !== null;
  }

  function clearAll(keepNotes = false) {
    q.value = '';
    Object.assign(state, { card: 'any', z: 'any', forms: 'any' });
    state.icv.fill(null);
    tracks.forEach((t) => t.reset());
    showIcv();
    if (!keepNotes) {
      kb.on.clear();
      readNotes();
    }
    apply();
    renderWhere();
  }
  $('clear').addEventListener('click', () => clearAll());

  function matches(it, text, own) {
    if (text && !it.haystack.includes(text) && it.sc.name !== own) return false;
    if (state.card !== 'any' && it.card !== state.card) return false;
    if (state.icv.some((v, i) => v !== null && it.icv[i] !== v)) return false;
    if (state.z === 'z' && !it.z) return false;
    if (state.z === 'no' && it.z) return false;
    if (state.forms !== 'any' && it.forms !== state.forms) return false;
    if (pool.by && !it.fit) return false;
    return true;
  }

  function apply() {
    const text = q.value.trim().toLowerCase();
    // Two or more pitch classes typed in any order and octave find the set's own class too.
    const own = /^[0-9ab]{2,}$/.test(text) ? PC.forteClass(UI.readSet(text).pcs).name : '';
    let shown = 0;
    for (const it of items) {
      const ok = matches(it, text, own);
      it.tr.hidden = !ok;
      if (ok) shown++;
    }
    $('count').textContent = `${shown} of ${items.length}`;
    $('clear').hidden = !active();
    $('none').hidden = shown > 0;
    $('sc-table').hidden = shown === 0;
  }

  // ---------- sorting ----------

  const compare = {
    name: (a, b) => a.index - b.index,
    prime: (a, b) => a.card - b.card || (a.prime < b.prime ? -1 : a.prime > b.prime ? 1 : 0),
    icv: (a, b) => {
      for (let i = 0; i < 6; i++) if (a.icv[i] !== b.icv[i]) return a.icv[i] - b.icv[i];
      return 0;
    },
    forms: (a, b) => a.forms - b.forms,
  };
  let sortKey = 'name';
  let sortDir = 1;
  const heads = [...document.querySelectorAll('#sc-table thead th')];

  function sortBy(key, dir) {
    sortKey = key;
    sortDir = dir;
    heads.forEach((th) => {
      const own = th.querySelector('button')?.dataset.sort === key;
      if (own) th.setAttribute('aria-sort', sortDir === 1 ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
    const sorted = [...items].sort((a, b) => sortDir * compare[key](a, b) || a.index - b.index);
    tbody.append(...sorted.map((it) => it.tr));
  }

  document.querySelector('#sc-table thead').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sort]');
    if (!b) return;
    const key = b.dataset.sort;
    sortBy(key, key === sortKey ? -sortDir : 1);
  });

  /** Choose a class and bring its row into view, clearing the filters first if they hide it. */
  function jumpTo(it) {
    // A class outside the notes takes the notes off; one inside them keeps them.
    if (it.tr.hidden) clearAll(pool.by !== null && pool.by.has(it.sc.name));
    choose(it);
    it.tr.scrollIntoView({ block: 'center', behavior: UI.REDUCED ? 'auto' : 'smooth' });
    it.tr.classList.remove('found');
    void it.tr.offsetWidth;
    it.tr.classList.add('found');
  }

  // ---------- the table: a name or a row shows that class on the clock; a Z-mate jumps to the other class ----------

  tbody.addEventListener('click', (e) => {
    const mate = e.target.closest('button[data-mate]');
    const row = e.target.closest('tr');
    if (!row) return;
    if (!mate) return choose(items[row.dataset.i]);
    jumpTo(items.find((i) => i.sc.name === mate.dataset.mate));
  });
  $('p-comp').addEventListener('click', () => jumpTo(chosen.comp));

  // Start with a class already on the clock, so the panel is never an empty ring.
  readNotes();
  choose(items.find((i) => i.card === 3));
  apply();
})();
