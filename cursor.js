/* Sticky cursor, carried over from YUBI (playground/blank-page/Mine.html).
   Same behavior: a teal disc trails the mouse and stretches along its motion, wraps [data-hover] elements,
   and the element leans toward the mouse and springs back.

   Motion model (v2): every value moves once per animation frame toward a target, using the real frame time (dt).
   Nothing restarts on mouse events, so the result does not depend on mouse polling rate or event timing.
   - position, size, radius: exponential approach, no overshoot
   - stretch: a smoothed vector, applied as rotate(a) scale(sx, sy) rotate(-a), so the shape stretches along
     the motion direction without the shape itself rotating; on a held element the stretch is axis-aligned only
   - an element's lean is limited so it never leaves its nearest clipping container (overflow scroll/hidden)
   - size grows as the disc arrives at the element, so a fast or diagonal approach does not inflate early
   - element lean: damped spring (some bounce, the "sticky" feel)

   Attributes: data-hover, data-radius (pill | circle | box | auto), data-pad, data-min, data-pull, data-stretch,
   data-hover-fit (child to wrap), data-hover-bounds (child the mouse enters and leaves).
   Off for reduced motion and touch screens: the system cursor stays. */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(pointer: fine)').matches) return;

  // selector -> [data-radius, data-pull, data-min (optional)]. Pull 0 = wrap only, no lean.
  const AUTO = [
    ['.top nav a, .top .ext a, .top .name', 'pill', 0.2],
    ['.btn, .open-gal, .chip, .gal-btn, .gal-full', 'pill', 0.2],
    ['.link', 'box', 0.1],
    ['.foot a', 'pill', 0.2],   // email and LinkedIn
    ['.pop a', 'pill', 0.1, 40], // source link in a citation popup; smaller so the pill stays inside the popup
  ];
  const NATIVE = '.board-track, .gal-stage, .gal-zoom, .tile, .g-frame, .cite, input, textarea, select, [contenteditable]';

  // rates are 1/s; the approach per frame is 1 - exp(-rate * dt)
  const RATE = {
    trail: 22,    // free disc following the mouse: ~45 ms behind (1/rate). Raise to tighten, lower to trail more
    lock: 20,     // disc moving onto a held element
    grow: 18,     // size and corner radius toward a held element
    shrink: 18,   // size and corner radius back to the 24 px disc
    stretch: 20,  // stretch vector
  };
  const DISC = 24;
  const MAGNET = 0.1;        // disc sits 1/10 of the way from the element center toward the mouse
  const PULL = 0.2;          // element lean, fraction of mouse offset
  const SPRING = { k: 210, c: 15 }; // lean spring: stiffness, damping (damping ratio ~0.5)

  const approach = (rate, dt) => 1 - Math.exp(-rate * dt);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smoothstep = t => t * t * (3 - 2 * t);

  const dot = document.createElement('div');
  const el = document.createElement('div');
  dot.id = 'kc-dot'; el.id = 'kc-disc';
  dot.setAttribute('aria-hidden', 'true'); el.setAttribute('aria-hidden', 'true');
  document.body.append(dot, el);

  const hand = { x: -100, y: -100 };
  const pos = { x: -100, y: -100 }, prev = { x: -100, y: -100 };
  const size = { w: DISC, h: DISC, r: DISC / 2 };
  const stretch = { x: 0, y: 0 };      // free: along the motion direction
  const grip = { x: 0, y: 0 };         // held: axis-aligned growth toward the mouse side, never tilts the shape
  let hoverEl = null, seen = false, last = 0;

  // ---- what the cursor holds; the page can style it (body.kc-holding, [data-hover].kc-held)
  function hold(element) {
    if (hoverEl === element) return;
    if (hoverEl) hoverEl.classList.remove('kc-held');
    hoverEl = element;
    if (element) element.classList.add('kc-held');
    document.body.classList.toggle('kc-holding', !!element);
  }

  // ---- element lean: one spring per element, removed when it settles
  const leans = new Map(); // el -> {x, y, vx, vy}

  // nearest ancestor that clips its content (overflow other than visible); a lean must stay inside it
  function clipperOf(element) {
    for (let p = element.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return p;
    }
    return null;
  }
  // [min, max] lean on one axis so the element's box stays inside the clipper's padding box (always includes 0)
  function room(lo, hi, cLo, cHi) {
    return [Math.min(0, cLo - lo), Math.max(0, cHi - hi)];
  }
  function leanOf(element) {
    let l = leans.get(element);
    if (!l) leans.set(element, (l = { x: 0, y: 0, vx: 0, vy: 0 }));
    return l;
  }
  function stepLeans(dt) {
    for (const [element, l] of leans) {
      if (!element.isConnected) { leans.delete(element); continue; }
      let tx = 0, ty = 0, rx = [-Infinity, Infinity], ry = [-Infinity, Infinity];
      const r = element.getBoundingClientRect();
      // the element's box without the current lean, so the lean does not feed back into itself
      const left = r.left - l.x, top = r.top - l.y, right = left + r.width, bottom = top + r.height;
      if (l.clip === undefined) l.clip = clipperOf(element);
      if (l.clip) {
        const c = l.clip.getBoundingClientRect();
        const cl = c.left + l.clip.clientLeft, ct = c.top + l.clip.clientTop;
        rx = room(left, right, cl, cl + l.clip.clientWidth);
        ry = room(top, bottom, ct, ct + l.clip.clientHeight);
      }
      if (element === hoverEl) {
        const pull = parseFloat(element.dataset.pull ?? String(PULL));
        tx = clamp((hand.x - (left + r.width / 2)) * pull, rx[0], rx[1]);
        ty = clamp((hand.y - (top + r.height / 2)) * pull, ry[0], ry[1]);
      }
      // semi-implicit Euler in substeps of at most 1/240 s: stable at any frame rate
      for (let t = dt; t > 0; t -= 1 / 240) {
        const h = Math.min(t, 1 / 240);
        l.vx += (SPRING.k * (tx - l.x) - SPRING.c * l.vx) * h;
        l.vy += (SPRING.k * (ty - l.y) - SPRING.c * l.vy) * h;
        l.x += l.vx * h;
        l.y += l.vy * h;
        // the spring's bounce may not carry the element past the clipper's edge either
        if (l.x < rx[0] || l.x > rx[1]) { l.x = clamp(l.x, rx[0], rx[1]); l.vx = 0; }
        if (l.y < ry[0] || l.y > ry[1]) { l.y = clamp(l.y, ry[0], ry[1]); l.vy = 0; }
      }
      if (element !== hoverEl && Math.abs(l.x) + Math.abs(l.y) < 0.05 && Math.abs(l.vx) + Math.abs(l.vy) < 0.5) {
        element.style.transform = '';
        leans.delete(element);
      } else {
        element.style.transform = `translate(${l.x.toFixed(2)}px, ${l.y.toFixed(2)}px)`;
      }
    }
  }

  // ---- where the disc is going this frame
  function targets() {
    if (!hoverEl) return { x: hand.x, y: hand.y, w: DISC, h: DISC, r: DISC / 2, rate: RATE.trail, held: false };
    const fitEl = hoverEl.querySelector('[data-hover-fit]') || hoverEl;
    const rect = fitEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const basePad = parseFloat(hoverEl.dataset.pad || '50');
    const padX = Math.min(basePad, Math.max(16, rect.width * 0.3));
    const padY = Math.min(basePad, Math.max(16, rect.height * 0.3));
    const minSize = parseFloat(hoverEl.dataset.min || '56');
    let mode = hoverEl.dataset.radius || 'auto';
    if (mode === 'auto') {
      const round = getComputedStyle(fitEl).borderRadius.includes('%') && Math.abs(rect.width - rect.height) < 8;
      mode = round ? 'circle' : 'box';
    }
    let w = Math.max(rect.width + padX, minSize * 0.85), h = Math.max(rect.height + padY, minSize * 0.85), r;
    if (mode === 'circle') { w = h = Math.max(Math.max(rect.width, rect.height) * 2, minSize); r = w / 2; }
    else if (mode === 'pill') r = h / 2;
    else r = 8;
    return {
      x: cx + (hand.x - cx) * MAGNET, y: cy + (hand.y - cy) * MAGNET,
      w, h, r, rate: RATE.lock, held: true, cx, cy, ew: rect.width, eh: rect.height,
    };
  }

  function frame(now) {
    const dt = last ? clamp((now - last) / 1000, 1 / 240, 1 / 20) : 1 / 60;
    last = now;
    if (hoverEl && !hoverEl.isConnected) hold(null);

    stepLeans(dt);
    const t = targets();

    // position
    const a = approach(t.rate, dt);
    pos.x += (t.x - pos.x) * a;
    pos.y += (t.y - pos.y) * a;

    // size: grow only as the disc arrives, so a fast approach does not inflate the disc early
    let tw = t.w, th = t.h, tr = t.r;
    if (t.held) {
      const reach = Math.max(t.w, t.h) * 0.75 + 40;
      const g = smoothstep(clamp(1 - Math.hypot(pos.x - t.x, pos.y - t.y) / reach, 0, 1));
      tw = DISC + (t.w - DISC) * g;
      th = DISC + (t.h - DISC) * g;
      tr = DISC / 2 + (t.r - DISC / 2) * g;
    }
    const s = approach(t.held ? RATE.grow : RATE.shrink, dt);
    size.w += (tw - size.w) * s;
    size.h += (th - size.h) * s;
    size.r += (tr - size.r) * s;

    // stretch vector: along the disc's own motion when free; a slight pull toward the mouse when held
    const vx = (pos.x - prev.x) / dt, vy = (pos.y - prev.y) / dt;
    prev.x = pos.x; prev.y = pos.y;
    let sx = 0, sy = 0, gx = 0, gy = 0;
    if (t.held) {
      const k = 0.08 * parseFloat(hoverEl.dataset.stretch || '1');
      gx = Math.min(Math.abs(hand.x - t.cx) / Math.max(t.ew / 2, 1), 1) * k;
      gy = Math.min(Math.abs(hand.y - t.cy) / Math.max(t.eh / 2, 1), 1) * k;
    } else {
      const m = Math.min(Math.hypot(vx, vy) * (0.04 / 60), 1); // the original: px per 60 Hz frame x 0.04
      const big = Math.min(1, 36 / Math.max(size.w, size.h)); // a shape still shrinking from an element barely stretches
      const sp = Math.hypot(vx, vy) || 1;
      sx = (vx / sp) * m * big;
      sy = (vy / sp) * m * big;
    }
    const st = approach(RATE.stretch, dt);
    stretch.x += (sx - stretch.x) * st;
    stretch.y += (sy - stretch.y) * st;
    grip.x += (gx - grip.x) * st;
    grip.y += (gy - grip.y) * st;

    render();
    requestAnimationFrame(frame);
  }

  function render() {
    const m = Math.hypot(stretch.x, stretch.y);
    const ang = Math.atan2(stretch.y, stretch.x) * (180 / Math.PI);
    const along = 1 + m, across = 1 - Math.min(m * 0.45, 0.3);
    const r = Math.min(size.r, size.w / 2, size.h / 2);
    el.style.width = `${size.w.toFixed(2)}px`;
    el.style.height = `${size.h.toFixed(2)}px`;
    el.style.marginLeft = `${(-size.w / 2).toFixed(2)}px`;
    el.style.marginTop = `${(-size.h / 2).toFixed(2)}px`;
    el.style.borderRadius = `${r.toFixed(2)}px`;
    el.style.transform =
      `translate3d(${pos.x.toFixed(2)}px, ${pos.y.toFixed(2)}px, 0) ` +
      `rotate(${ang.toFixed(2)}deg) scale(${along.toFixed(4)}, ${across.toFixed(4)}) rotate(${(-ang).toFixed(2)}deg) ` +
      `scale(${(1 + grip.x).toFixed(4)}, ${(1 + grip.y).toFixed(4)})`;
  }

  // ---- binding
  const bound = new WeakSet();
  function bind(element) {
    if (bound.has(element)) return;
    bound.add(element);
    let bounds = element.querySelector(':scope > [data-hover-bounds]');
    if (!bounds) {
      bounds = document.createElement('span');
      bounds.setAttribute('data-hover-bounds', '');
      bounds.setAttribute('aria-hidden', 'true');
      element.append(bounds);
    }
    const cs = getComputedStyle(element);
    if (cs.position === 'static') element.style.position = 'relative';
    if (cs.display === 'inline') element.style.display = 'inline-block'; // transforms need a box

    bounds.addEventListener('pointerenter', () => {
      hold(element);
      if (parseFloat(element.dataset.pull ?? String(PULL))) leanOf(element);
    });
    bounds.addEventListener('pointerleave', () => { if (hoverEl === element) hold(null); });
  }

  function scan(root) {
    for (const [sel, radius, pull, min] of AUTO) {
      for (const n of root.querySelectorAll(sel)) {
        if (!n.hasAttribute('data-hover')) {
          n.setAttribute('data-hover', '');
          n.dataset.radius ??= radius;
          n.dataset.pull ??= String(pull);
          if (min) n.dataset.min ??= String(min);
        }
      }
    }
    for (const n of root.querySelectorAll('[data-hover]')) bind(n);
  }
  scan(document);
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n.parentElement || n);
  }).observe(document.body, { childList: true, subtree: true });

  // ---- input: events only record where the mouse is; all motion happens in frame()
  const body = document.body;
  addEventListener('pointermove', e => {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    hand.x = e.clientX; hand.y = e.clientY;
    dot.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    const tg = e.target instanceof Element ? e.target : null;
    body.classList.toggle('kc-native', !!tg && !tg.closest('[data-hover]') && !!tg.closest(NATIVE));
    if (!seen) {
      seen = true;
      pos.x = prev.x = e.clientX; // start under the mouse, not flying in from the corner
      pos.y = prev.y = e.clientY;
      body.classList.add('kc-on');
      requestAnimationFrame(frame);
    }
    body.classList.remove('kc-out');
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => body.classList.add('kc-out'));
})();
