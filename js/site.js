// Every page: on a small screen the page links fold into a side bar behind a three-line button,
// and a notice says once per visit that the app works best on a computer.

(() => {
  const small = window.matchMedia('(max-width: 900px)');
  const root = document.documentElement;

  // ---------- the side bar ----------

  const bar = document.querySelector('header.site .bar');
  const nav = bar && bar.querySelector('nav');
  if (nav) {
    nav.id = 'site-nav';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'menu-btn';
    open.setAttribute('aria-label', 'Menu');
    open.setAttribute('aria-expanded', 'false');
    open.setAttribute('aria-controls', 'site-nav');
    open.innerHTML = '<span></span><span></span><span></span>';
    bar.appendChild(open);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'menu-close';
    close.setAttribute('aria-label', 'Close menu');
    close.innerHTML = '<span></span><span></span>';
    nav.prepend(close);

    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    document.body.appendChild(scrim);

    const set = (on) => {
      nav.classList.toggle('open', on);
      scrim.classList.toggle('open', on);
      root.classList.toggle('menu-open', on);
      open.setAttribute('aria-expanded', String(on));
      if (on) close.focus({ preventScroll: true });
      else if (document.activeElement && nav.contains(document.activeElement)) open.focus({ preventScroll: true });
    };
    open.addEventListener('click', () => set(true));
    close.addEventListener('click', () => set(false));
    scrim.addEventListener('click', () => set(false));
    nav.addEventListener('click', (e) => {
      if (e.target.closest('a')) set(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) set(false);
    });
    // Back on a wide window the links are a row again, so the side bar is closed.
    small.addEventListener('change', () => !small.matches && set(false));
  }

  // ---------- the notice ----------

  const KEY = 'omt-notice';
  const touchOnly = window.matchMedia('(pointer: coarse) and (hover: none)');
  const seen = () => {
    try {
      return sessionStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  };
  const remember = () => {
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {}
  };

  if ((small.matches || touchOnly.matches) && !seen()) {
    const box = document.createElement('dialog');
    box.className = 'notice';
    box.setAttribute('aria-labelledby', 'notice-text');
    box.innerHTML =
      '<p id="notice-text">The app works best on computers</p>' +
      '<button type="button" class="btn primary">Continue</button>';
    document.body.appendChild(box);
    const done = () => {
      remember();
      box.close();
      box.remove();
    };
    box.querySelector('button').addEventListener('click', done);
    box.addEventListener('cancel', (e) => {
      e.preventDefault();
      done();
    });
    if (typeof box.showModal === 'function') box.showModal();
    else box.setAttribute('open', '');
  }
})();
