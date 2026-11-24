(() => {
'use strict';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
/* ---------- ASCII scene: Apollo capsule with a tethered astronaut ---------- */
function ascii() {
  const cv = document.getElementById('space'); if (!cv) return;
  const src = window.ASCII_SRC; if (!cv || !src) return;
  const ctx = cv.getContext('2d');
  const CHARS = " .'`,:;-_~^|/\\()<>[]{}+=!";
  const FILL = " .`'-,:;~^\"!=+<>i?l][}{1tjfrcvxzunoeaswmk#%&@$";
  let ramp = [];
  const FONT_PX = 5.5;
  let cw = 6.6, ch = 12, dpr = 1, vw = 0, vh = 0;
  let glyphVecs = [];
  const cache = new Map();

  const load = u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });

  // 6 sampling regions per cell: 2 columns x 3 rows
  const REG = [[.25, .17], [.75, .17], [.25, .5], [.75, .5], [.25, .83], [.75, .83]];

  function buildGlyphs() {
    const c = document.createElement('canvas');
    const S = 4; // supersample
    const gw = Math.round(cw * S), gh = Math.round(ch * S);
    c.width = gw; c.height = gh;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.font = `${FONT_PX * S}px "Plex Mono", ui-monospace, monospace`;
    g.textBaseline = 'middle';
    const vecs = [];
    for (const chr of CHARS) {
      g.clearRect(0, 0, gw, gh); g.fillStyle = '#000';
      g.fillText(chr, 0, gh * .52);
      const d = g.getImageData(0, 0, gw, gh).data;
      const v = REG.map(([rx, ry]) => {
        let s = 0, n = 0; const cx = rx * gw, cy = ry * gh, rad = gw * .3;
        for (let yy = Math.floor(cy - rad); yy <= cy + rad; yy++) for (let xx = Math.floor(cx - rad); xx <= cx + rad; xx++) {
          if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
          if ((xx - cx) ** 2 + (yy - cy) ** 2 > rad * rad) continue;
          s += d[(yy * gw + xx) * 4 + 3] / 255; n++;
        }
        return n ? s / n : 0;
      });
      vecs.push(v);
    }
    const mx = [0, 0, 0, 0, 0, 0];
    vecs.forEach(v => v.forEach((a, i) => mx[i] = Math.max(mx[i], a)));
    glyphVecs = vecs.map(v => v.map((a, i) => a / (mx[i] || 1)));
    // density ramp for tonal fill
    const dens = [];
    for (const chr of FILL) {
      g.clearRect(0, 0, gw, gh); g.fillStyle = '#000'; g.fillText(chr, 0, gh * .52);
      const dd = g.getImageData(0, 0, gw, gh).data; let s2 = 0;
      for (let i = 3; i < dd.length; i += 4) s2 += dd[i];
      dens.push([chr, s2]);
    }
    dens.sort((a, b) => a[1] - b[1]);
    const top = dens[dens.length - 1][1] || 1;
    ramp = dens.map(([c2, v2]) => [c2, v2 / top]);
  }

  function nearest(v) {
    const key = v.map(a => Math.round(a * 7)).join('');
    const hit = cache.get(key); if (hit !== undefined) return hit;
    let best = 0, bd = 1e9;
    for (let i = 0; i < glyphVecs.length; i++) {
      const g = glyphVecs[i]; let d = 0;
      for (let k = 0; k < 6; k++) { const e = g[k] - v[k]; d += e * e; }
      if (d < bd) { bd = d; best = i; }
    }
    cache.set(key, CHARS[best]); return CHARS[best];
  }

  // Sample an image into a grid of [char, intensity].
  // Edges are traced with line glyphs matched by shape; flat areas get a light tonal ramp.
  const RAMP = " .:-=+";
  function toGlyphs(imgCanvas, cols, rows, gain) {
    const w = imgCanvas.width, h = imgCanvas.height;
    const d = imgCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const lum = (px, py) => { px = Math.min(w - 1, Math.max(0, px | 0)); py = Math.min(h - 1, Math.max(0, py | 0)); const o = (py * w + px) * 4; return (d[o] * d[o + 3]) / 65025; };
    const out = [];
    const sx = w / cols, sy = h / rows;
    for (let r = 0; r < rows; r++) {
      const line = [];
      for (let c = 0; c < cols; c++) {
        const v = REG.map(([rx, ry]) => {
          const cx = (c + rx) * sx, cy = (r + ry) * sy, rr = sx * .28;
          return (lum(cx, cy) * 2 + lum(cx - rr, cy) + lum(cx + rr, cy) + lum(cx, cy - rr) + lum(cx, cy + rr)) / 6;
        });
        let mx = 0, mn = 1, sum = 0; for (const a of v) { mx = Math.max(mx, a); mn = Math.min(mn, a); sum += a; }
        const mean = Math.min(1, Math.pow(sum / 6, .85) * gain);
        if (sum / 6 < .04) { line.push(null); continue; }
        if (false) {
          const e = v.map(a => Math.pow(Math.max(0, a - mn) / (mx - mn), 1.4));
          line.push([nearest(e), .6 + mean * .4]);
        } else {
          // pick the ramp glyph whose ink density is closest to the target tone
          const target = Math.pow(mean, 1.3) * .75;
          let best = ramp[1][0], bd = 9;
          for (const [c2, v2] of ramp) { const dd = Math.abs(v2 - target); if (dd < bd) { bd = dd; best = c2; } }
          line.push([best, .35 + mean * .65]);
        }
      }
      out.push(line);
    }
    return out;
  }

  /* ---- Scene: the capsule and the astronaut are made of particles ----
     Each character has a home position. A moving pointer nudges nearby characters
     aside and a damped spring brings them back; a click gives a small push.
     Performance: the capsule canvas sits in the page and scrolls natively; it only
     redraws while characters move or the tether sways. The astronaut has its own
     small canvas, moved and rotated with a CSS transform, and redraws only while
     its characters move. Nothing repaints under the blurred header or bottom blur. */
  let capImg, capGrid = [], capCols = 0, capRows = 0, capX = 0, capY = 0;
  let sceneScale = 1, narrow = false, R = 95;
  let sceneL = 0, sceneW = 0, sceneH = 0;
  let astBaseX = 0, astBaseY = 0, astW = 0, astH = 0, compX = 0, compY = 0, compA = .5;
  const mouse = { x: -999, y: -999, vx: 0, vy: 0, lt: 0 };
  let blast = null;
  const t0 = performance.now();

  const swarm = n => ({ ox: new Float32Array(n), oy: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), r: new Float32Array(n), vr: new Float32Array(n), on: new Uint8Array(n), list: [] });
  function push(S, i, fx, fy, fr, onWake) {
    S.vx[i] += fx; S.vy[i] += fy; S.vr[i] += fr;
    if (!S.on[i]) { S.on[i] = 1; S.list.push(i); if (onWake) onWake(i); }
  }
  function settle(S, dt, onRest) {
    const k = .06 * dt, damp = Math.pow(.84, dt), L = S.list;
    for (let j = L.length - 1; j >= 0; j--) {
      const i = L[j];
      S.vx[i] = (S.vx[i] - S.ox[i] * k) * damp; S.vy[i] = (S.vy[i] - S.oy[i] * k) * damp; S.vr[i] = (S.vr[i] - S.r[i] * k) * damp;
      S.ox[i] += S.vx[i] * dt; S.oy[i] += S.vy[i] * dt; S.r[i] += S.vr[i] * dt;
      if (Math.abs(S.ox[i]) + Math.abs(S.oy[i]) < .2 && Math.abs(S.vx[i]) + Math.abs(S.vy[i]) < .06 && Math.abs(S.r[i]) < .01) {
        S.ox[i] = S.oy[i] = S.vx[i] = S.vy[i] = S.r[i] = S.vr[i] = 0; S.on[i] = 0;
        L[j] = L[L.length - 1]; L.pop(); if (onRest) onRest(i);
      }
    }
  }
  function restAll(S, onRest) { for (const i of S.list) { S.ox[i] = S.oy[i] = S.vx[i] = S.vy[i] = S.r[i] = S.vr[i] = 0; S.on[i] = 0; if (onRest) onRest(i); } S.list.length = 0; }

  // capsule: characters at rest are cached on a layer; moving ones are drawn on top
  let cap = swarm(0), capCell = new Int32Array(0), capChr = [], capAl = new Float32Array(0), capRC = new Int32Array(0);
  const capLayer = document.createElement('canvas'); let lctx = null, sceneDirty = true;
  function glyphCell(i, show) {
    const rc = capRC[i], r = (rc / capCols) | 0, c = rc % capCols;
    lctx.clearRect(c * cw, r * ch, cw, ch);
    if (show) { lctx.fillStyle = 'rgba(62,127,122,' + capAl[i].toFixed(3) + ')'; lctx.fillText(capChr[i], c * cw, r * ch); }
  }
  const hideCell = i => glyphCell(i, false), showCell = i => { glyphCell(i, true); sceneDirty = true; };

  // astronaut: hand-drawn figure on its own canvas
  const ASTRO = [
    "      .-\"\"-.",
    "     / .--. \\",
    "    | (    ) |",
    "   _ \\ '--' / _",
    "  / \\ '-..-' / \\",
    " /  /|  []  |\\  \\",
    " \\_/ |  ||  | \\_/",
    "     |__||__|",
    "     |  ||  |",
    "    (___)(___)"
  ];
  let ac = document.getElementById('astro');
  if (!ac) { ac = document.createElement('canvas'); ac.id = 'astro'; ac.setAttribute('aria-hidden', 'true'); cv.after(ac); }
  const actx = ac.getContext('2d');
  let AFONT = 10, ACW = 6.02, ACH = 12, aW = 0, aH = 0, APAD = 70, astDirty = true;
  let ast = swarm(0), astLX = new Float32Array(0), astLY = new Float32Array(0), astChr = [];

  function drawAstro() {
    actx.setTransform(dpr, 0, 0, dpr, 0, 0);
    actx.clearRect(0, 0, aW, aH);
    actx.font = `${AFONT}px "Plex Mono", ui-monospace, monospace`; actx.textBaseline = 'top';
    for (let pass = 0; pass < 2; pass++) {
      actx.fillStyle = pass ? 'rgba(38,38,38,.85)' : 'rgba(62,127,122,.95)';
      for (let i = 0; i < astChr.length; i++) {
        if (ast.on[i] !== pass) continue;
        const x = aW / 2 + astLX[i] + ast.ox[i], y = aH / 2 + astLY[i] + ast.oy[i], rr = ast.r[i];
        if (Math.abs(rr) > .04) {
          const c2 = Math.cos(rr), s2 = Math.sin(rr);
          actx.setTransform(dpr * c2, dpr * s2, -dpr * s2, dpr * c2, dpr * x, dpr * y);
          actx.fillText(astChr[i], 0, 0);
          actx.setTransform(dpr, 0, 0, dpr, 0, 0);
        } else actx.fillText(astChr[i], x, y);
      }
    }
  }

  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = document.documentElement.clientWidth; vh = innerHeight;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${FONT_PX}px "Plex Mono", ui-monospace, monospace`;
    cw = ctx.measureText('M').width; ch = FONT_PX * 1.25;
    buildGlyphs(); cache.clear();

    narrow = vw < 1100;
    sceneScale = narrow ? .7 : 1; R = narrow ? 60 : 80;
    AFONT = narrow ? 7 : 10; ACW = AFONT * .602; ACH = AFONT * 1.2;
    // short landscape screens (phones on their side): a smaller capsule in the right third, clear of the text
    const wide = narrow && vw > vh * 1.4 && vh < 600;
    const capW = wide ? Math.min(340, vw * .34) : narrow ? Math.min(400, vw * .62) : Math.min(560, vw * .37);
    capCols = Math.round(capW / cw);
    capRows = Math.round(capCols * cw * (capImg.height / capImg.width) / ch);
    const tmp = document.createElement('canvas'); tmp.width = capCols * 4; tmp.height = capRows * 4;
    tmp.getContext('2d', { willReadFrequently: true }).drawImage(capImg, 0, 0, tmp.width, tmp.height);
    capGrid = toGlyphs(tmp, capCols, capRows, 1.3);
    capX = narrow ? vw - capCols * cw - 16 : Math.min(vw * .58, vw - capCols * cw - 40);
    capY = narrow ? 96 : 120;

    const chr = [], al = [], rc = [];
    capGrid.forEach((row, r) => row.forEach((g, c) => { if (g && g[0] !== ' ') { chr.push(g[0]); al.push(g[1] * .75); rc.push(r * capCols + c); } }));
    cap = swarm(chr.length); capChr = chr; capAl = Float32Array.from(al); capRC = Int32Array.from(rc);
    capCell = new Int32Array(capRows * capCols).fill(-1); rc.forEach((v, i) => { capCell[v] = i; });
    capLayer.width = Math.ceil(capCols * cw * dpr); capLayer.height = Math.ceil(capRows * ch * dpr);
    lctx = capLayer.getContext('2d'); lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.font = ctx.font; lctx.textBaseline = 'top';
    for (let i = 0; i < chr.length; i++) glyphCell(i, true);

    // astronaut figure and its canvas, with room for characters to move
    const lx = [], ly = [], chs = [];
    astW = 18 * ACW; astH = ASTRO.length * ACH; APAD = narrow ? 50 : 70;
    ASTRO.forEach((row, r) => [...row].forEach((c, k) => { if (c !== ' ') { chs.push(c); lx.push(-astW / 2 + k * ACW); ly.push(-astH / 2 + r * ACH); } }));
    ast = swarm(chs.length); astChr = chs; astLX = Float32Array.from(lx); astLY = Float32Array.from(ly);
    aW = Math.ceil(astW + APAD * 2); aH = Math.ceil(astH + APAD * 2);
    ac.width = Math.round(aW * dpr); ac.height = Math.round(aH * dpr);
    ac.style.width = aW + 'px'; ac.style.height = aH + 'px';
    astDirty = true;

    // first screen: below the capsule hatch, clear of the text column
    const lead = document.querySelector('.intro .lead');
    astBaseX = wide ? capX + capCols * cw * .35 : narrow ? 18 : Math.max(lead ? lead.getBoundingClientRect().right + 30 : 0, capX - 110);
    astBaseY = wide ? capY + capRows * ch + 8 : narrow ? capY + 4 : capY + capRows * ch + 30;

    // the capsule canvas covers only the capsule, the tether and the first-screen astronaut
    sceneL = Math.max(0, Math.floor(Math.min(capX, astBaseX) - 260));
    sceneW = vw - sceneL;
    sceneH = Math.ceil(Math.max(capY + capRows * ch, astBaseY + astH) + 120);
    cv.width = Math.round(sceneW * dpr); cv.height = Math.round(sceneH * dpr);
    cv.style.left = sceneL + 'px'; cv.style.width = sceneW + 'px'; cv.style.height = sceneH + 'px';
    sceneDirty = true;

    // after the first screen the astronaut floats in the empty left column beside the sections
    const main = document.querySelector('.sec .sec-main'), sec = main && main.parentElement;
    const cols = sec ? getComputedStyle(sec).gridTemplateColumns.trim().split(/\s+/).length : 1;
    if (cols > 1) {
      const left = sec.getBoundingClientRect().left + parseFloat(getComputedStyle(sec).paddingLeft);
      compX = (left + main.getBoundingClientRect().left) / 2; compY = vh * .58; compA = .6;
    } else { compX = vw - astW * .55 - 10; compY = vh * .7; compA = 0; }
  }

  let lastT = 0, lastScene = 0, sy = -1, sv = 0, prevTA = 1, fx = null, fy = 0, tilt = 0;
  const TEAL = 'rgba(62,127,122,';
  function frame(now, force) {
    const dt = Math.min(3, lastT ? (now - lastT) / 16.7 : 1); lastT = now;
    const t = (now - t0) / 1000, y = scrollY, motion = reduce ? 0 : 1;
    if (sy < 0) sy = y;
    sv += ((y - sy) / dt - sv) * Math.min(1, .25 * dt); sy = y;
    const p = Math.min(1, y / (vh * .85)), e = p < .5 ? 2 * p * p : 1 - (2 - 2 * p) ** 2 / 2;
    const decay = Math.pow(.78, dt); mouse.vx *= decay; mouse.vy *= decay;
    // only a moving pointer moves characters, and only a little
    const boost = Math.min(3, Math.hypot(mouse.vx, mouse.vy) * 1.5);
    const live = motion && mouse.x > -500 && boost > .05;

    // astronaut: follows a target with a soft spring, so scrolling never jerks it.
    // On the first screen the target scrolls with the capsule; after it, the target is the left column.
    const hx0 = astBaseX + astW / 2, hy0 = astBaseY + astH / 2;
    const tx = hx0 + (compX - hx0) * e + motion * Math.sin(y * .0018) * 24 * p;
    const ty = hy0 - y * (1 - e) + (compY - hy0) * e;
    if (fx === null || !motion) { fx = tx; fy = ty; }
    const kf = 1 - Math.pow(1 - .06, dt), pfy = fy;
    fx += (tx - fx) * kf; fy += (ty - fy) * kf;
    tilt += ((motion ? Math.max(-.22, Math.min(.22, (fy - pfy) / dt * .012)) : 0) - tilt) * (1 - Math.pow(.92, dt));
    const acx = fx + motion * Math.sin(t * .23) * 18 * sceneScale;
    const acy = fy + motion * Math.sin(t * .17 + 1) * 10 * sceneScale;
    const ang = -.35 * (1 - e) + .1 * e + motion * Math.sin(t * .13) * .14 + tilt;
    const astA = .85 + (compA - .85) * e;
    ac.style.transform = `translate3d(${(acx - aW / 2).toFixed(1)}px,${(acy - aH / 2).toFixed(1)}px,0) rotate(${ang.toFixed(4)}rad)`;
    ac.style.opacity = astA.toFixed(3);
    const cs = Math.cos(ang), sn = Math.sin(ang);

    // pointer and click forces
    const sceneOn = y < sceneH;
    const pushAst = (fx, fy, i, spin) => push(ast, i, fx * cs + fy * sn, -fx * sn + fy * cs, spin);
    if (live) {
      const gain = boost * dt;
      if (sceneOn) {
        const px = mouse.x, py = mouse.y + y;
        const c0 = Math.max(0, Math.floor((px - R - capX) / cw)), c1 = Math.min(capCols - 1, Math.ceil((px + R - capX) / cw));
        const r0 = Math.max(0, Math.floor((py - R - capY) / ch)), r1 = Math.min(capRows - 1, Math.ceil((py + R - capY) / ch));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const i = capCell[r * capCols + c]; if (i < 0) continue;
          const dx = capX + c * cw + cw / 2 - px, dy = capY + r * ch + ch / 2 - py, d = Math.hypot(dx, dy);
          if (d >= R || d < .01) continue;
          const f = (1 - d / R) ** 2 * gain; if (f < .04) continue;
          push(cap, i, dx / d * f + (Math.random() - .5) * f * .35, dy / d * f + (Math.random() - .5) * f * .35, 0, hideCell);
        }
      }
      if (Math.hypot(mouse.x - acx, mouse.y - acy) < R + astW) {
        for (let i = 0; i < astChr.length; i++) {
          const dx = acx + astLX[i] * cs - astLY[i] * sn - mouse.x, dy = acy + astLX[i] * sn + astLY[i] * cs - mouse.y, d = Math.hypot(dx, dy);
          if (d >= R || d < .01) continue;
          const f = (1 - d / R) ** 2 * gain;
          pushAst(dx / d * f, dy / d * f, i, (Math.random() - .5) * f * .06);
        }
      }
    }
    if (blast && motion) {
      const B = R * 1.15;
      if (sceneOn) {
        const px = blast.x, py = blast.y + y;
        const c0 = Math.max(0, Math.floor((px - B - capX) / cw)), c1 = Math.min(capCols - 1, Math.ceil((px + B - capX) / cw));
        const r0 = Math.max(0, Math.floor((py - B - capY) / ch)), r1 = Math.min(capRows - 1, Math.ceil((py + B - capY) / ch));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const i = capCell[r * capCols + c]; if (i < 0) continue;
          const dx = capX + c * cw - px, dy = capY + r * ch - py, d = Math.hypot(dx, dy);
          if (d < B && d > .01) { const f = (1 - d / B) ** 1.5 * 5; push(cap, i, dx / d * f + (Math.random() - .5) * f * .4, dy / d * f + (Math.random() - .5) * f * .4, 0, hideCell); }
        }
      }
      for (let i = 0; i < astChr.length; i++) {
        const dx = acx + astLX[i] * cs - astLY[i] * sn - blast.x, dy = acy + astLX[i] * sn + astLY[i] * cs - blast.y, d = Math.hypot(dx, dy);
        if (d < B && d > .01) { const f = (1 - d / B) ** 1.5 * 5; pushAst(dx / d * f, dy / d * f, i, (Math.random() - .5) * .25); }
      }
    }
    blast = null;
    settle(cap, dt, showCell);
    const astMoving = ast.list.length > 0;
    settle(ast, dt);
    if (astMoving || astDirty) { drawAstro(); astDirty = astMoving; }

    // capsule canvas: redraw only while something on it changes
    const tA = .7 * Math.max(0, 1 - p * 2.4);
    if (!sceneOn) { if (cap.list.length) restAll(cap, showCell); prevTA = tA; return; }
    const busy = cap.list.length > 0 || Math.abs(sv) > .3;
    const due = force || sceneDirty || busy || (tA > .005 && now - lastScene > 33) || (prevTA > .005 && tA <= .005);
    prevTA = tA;
    if (!due) return;
    lastScene = now; sceneDirty = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, sceneW, sceneH);
    ctx.setTransform(dpr, 0, 0, dpr, -sceneL * dpr, 0);
    ctx.textBaseline = 'top';
    if (tA > .005) {
      // tether from the capsule hatch to the chest pack, in page coordinates
      const hx = capX + capCols * cw * .3, hy = capY + capRows * ch * .78;
      const bx = acx + 2 * cs + astH * .05 * sn, by = acy + y + 2 * sn - astH * .05 * cs;
      const sag = 34 * sceneScale + motion * Math.sin(t * .4) * 12 * sceneScale;
      const c1x = hx - 20, c1y = hy + sag * 1.8, c2x = bx + 40, c2y = by + sag * 1.4;
      const bez = (p0, p1, p2, p3, u) => (1 - u) ** 3 * p0 + 3 * (1 - u) ** 2 * u * p1 + 3 * (1 - u) * u * u * p2 + u ** 3 * p3;
      ctx.font = `${FONT_PX}px "Plex Mono", ui-monospace, monospace`;
      ctx.fillStyle = TEAL + tA.toFixed(3) + ')';
      let lastX = hx, lastY = hy, acc = 0;
      for (let i = 1; i <= 160; i++) {
        const u = i / 160, px = bez(hx, c1x, c2x, bx, u), py = bez(hy, c1y, c2y, by, u);
        acc += Math.hypot(px - lastX, py - lastY);
        if (acc >= cw * 1.1) {
          const a = ((Math.atan2(py - lastY, px - lastX) * 180 / Math.PI) % 180 + 180) % 180;
          ctx.fillText(a < 25 || a > 155 ? '-' : a < 65 ? '\\' : a < 115 ? '|' : '/', px - cw / 2, py - ch / 2);
          acc = 0;
        }
        lastX = px; lastY = py;
      }
    }
    ctx.drawImage(capLayer, capX, capY, capCols * cw, capRows * ch);
    if (cap.list.length) {
      ctx.font = `${FONT_PX}px "Plex Mono", ui-monospace, monospace`;
      ctx.fillStyle = 'rgba(38,38,38,.7)';
      for (const i of cap.list) { const rc = capRC[i]; ctx.fillText(capChr[i], capX + (rc % capCols) * cw + cap.ox[i], capY + ((rc / capCols) | 0) * ch + cap.oy[i]); }
    }
  }

  let raf = 0, running = false;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.documentElement.classList.contains('locked')) { lastT = 0; return; }
    frame(now);
  }
  function start() { if (running || reduce) return; running = true; raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); lastT = 0; }

  Promise.all([load(src.capsule), document.fonts ? document.fonts.load(`${FONT_PX}px "Plex Mono"`) : 0]).then(([c]) => {
    capImg = c;
    layout(); frame(performance.now(), true);
    if (!reduce) start();
    let rt, lw = innerWidth; addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        // a phone's address bar changes only the height: move the resting spot, keep the scene
        if (innerWidth === lw && innerWidth < 1100) { vh = innerHeight; compY = vh * .7; return; }
        lw = innerWidth; layout(); fx = null; frame(performance.now(), true);
      }, 150);
    });
    addEventListener('scroll', () => { if (reduce) frame(performance.now(), true); }, { passive: true });
    addEventListener('pointermove', e => {
      const now = performance.now(), dtm = Math.max(8, now - (mouse.lt || now - 16));
      if (mouse.x > -500) { mouse.vx += ((e.clientX - mouse.x) / dtm - mouse.vx) * .5; mouse.vy += ((e.clientY - mouse.y) / dtm - mouse.vy) * .5; }
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.lt = now;
    }, { passive: true });
    const away = () => { mouse.x = mouse.y = -999; mouse.vx = mouse.vy = 0; };
    document.documentElement.addEventListener('pointerleave', away);
    addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') away(); }, { passive: true });
    addEventListener('pointercancel', away, { passive: true });
    addEventListener('pointerdown', e => { if (!e.target.closest('a,button,input,.gallery')) blast = { x: e.clientX, y: e.clientY }; }, { passive: true });
    document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
    addEventListener('beforeprint', () => {
      stop(); away(); restAll(cap, showCell); restAll(ast);
      sv = 0; tilt = 0; fx = null; sy = -1; lastT = 0; astDirty = true;
      const s0 = scrollY; scrollTo(0, 0); frame(performance.now(), true); scrollTo(0, s0);
    });
    addEventListener('afterprint', () => { layout(); frame(performance.now(), true); start(); });
  });
}

/* ---------- Citations: numbered by first appearance; hover or tap to see the source ---------- */
function cites() {
  const R = window.REFS || {};
  const order = [];
  document.querySelectorAll('.cite').forEach(el => {
    const k = el.dataset.key; if (!R[k]) return;
    if (!order.includes(k)) order.push(k);
    const n = order.indexOf(k) + 1;
    el.textContent = n; el.href = '#ref-' + n; el.dataset.n = n;
  });
  const list = document.getElementById('ref-list');
  if (list) list.innerHTML = order.map((k, i) => { const r = R[k]; return `<li id="ref-${i + 1}">${r[0]}${r[2] ? ` <a href="${r[2]}">${r[2]}</a>` : ''}</li>`; }).join('');

  const pop = document.createElement('div'); pop.className = 'pop'; pop.setAttribute('role', 'tooltip'); pop.id = 'cite-pop';
  document.body.appendChild(pop);
  let hideT = 0, current = null;
  const show = el => {
    clearTimeout(hideT);
    const r = R[el.dataset.key]; if (!r) return;
    pop.innerHTML = `<b>${r[0]}</b>${r[1]}${r[2] ? `<br><a href="${r[2]}" target="_blank" rel="noopener">${new URL(r[2]).hostname.replace('www.', '')}</a>` : ''}`;
    pop.classList.add('on');
    const b = el.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    let x = b.left + scrollX + b.width / 2 - w / 2; x = Math.max(12 + scrollX, Math.min(x, scrollX + innerWidth - w - 12));
    let y = b.top + scrollY - h - 10; if (b.top - h < 16) y = b.bottom + scrollY + 10;
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
    current = el; el.setAttribute('aria-describedby', 'cite-pop');
  };
  const hide = () => { hideT = setTimeout(() => { pop.classList.remove('on'); if (current) current.removeAttribute('aria-describedby'); }, 140); };
  document.querySelectorAll('.cite').forEach(el => {
    el.setAttribute('aria-label', 'Source ' + el.dataset.n);
    el.addEventListener('mouseenter', () => show(el));
    el.addEventListener('mouseleave', hide);
    el.addEventListener('focus', () => show(el));
    el.addEventListener('blur', hide);
    el.addEventListener('click', e => { if (matchMedia('(hover: none)').matches) { e.preventDefault(); pop.classList.contains('on') && current === el ? hide() : show(el); } });
  });
  pop.addEventListener('mouseenter', () => clearTimeout(hideT));
  pop.addEventListener('mouseleave', hide);
  addEventListener('keydown', e => { if (e.key === 'Escape') pop.classList.remove('on'); });
}

/* ---------- Project boards + gallery overlay ---------- */
function galleries() {
  const G = window.GALLERIES || {};
  const esc = t => String(t).replace(/"/g, '&quot;');

  /* Boards on the page: panels of layered images.
     On wide screens the board pins in place and scrolling the page moves it sideways;
     elsewhere it scrolls sideways on its own. Chips jump to a group. Stacked cards come
     forward one at a time as the pointer moves across the stack, left to right. */
  const parseAr = s => { const [a, b] = String(s).split('/').map(Number); return b ? a / b : a; };
  document.querySelectorAll('.board[data-g]').forEach(board => {
    const key = board.dataset.g, data = G[key]; if (!data) return;
    const track = board.querySelector('.board-track'), pin = board.querySelector('.board-pin'), stick = board.querySelector('.board-stick');
    const chipsEl = board.querySelector('.chips'), bar = board.querySelector('.board-progress i');
    // the project title travels with the pinned board
    const head = board.previousElementSibling; if (head && head.classList.contains('exp-head')) stick.prepend(head);
    let n = 0;
    track.innerHTML = data.groups.map(g => {
      const tile = t => {
        const st = `--x:${t.x};--y:${t.y};--w:${t.w};--z:${t.z};--ar:${t.ar};${t.r ? `--r:${t.r};` : ''}${t.op ? `--op:${t.op};` : ''}${t.d ? `--d:${t.d};` : ''}`;
        if (t.ph) return `<div class="tile ph" style="${st}"><span class="face">${t.alt}</span></div>`;
        const i = n++;
        const set = t.thumb && t.tw && !t.excerpt && t.tw < t.nw ? ` srcset="${t.thumb} ${t.tw}w, ${t.src} ${t.nw}w" sizes="${Math.round(t.w * .9)}px"` : '';
        return `<button type="button" class="tile${t.float ? ' float' : ''}${t.excerpt ? ' excerpt' : ''}" style="${st}" data-i="${i}" aria-label="${esc(t.alt)}. Open in gallery"><span class="face"><img src="${t.thumb || t.src}"${set} alt="" loading="lazy" decoding="async" draggable="false"></span></button>`;
      };
      const clusters = {}, loose = [];
      g.items.forEach(t => t.cluster ? (clusters[t.cluster] = clusters[t.cluster] || []).push(t) : loose.push(t));
      const inner = Object.values(clusters).map(c => {
        const l = Math.min(...c.map(t => t.x)), r = Math.max(...c.map(t => t.x + t.w));
        const top = Math.min(...c.map(t => t.y)), bot = Math.max(...c.map(t => t.y + t.w / parseAr(t.ar)));
        const dots = `<span class="stack-dots" style="--x:${l};--y:${bot + 22};--w:${r - l}">${c.map(() => '<i></i>').join('')}</span>`;
        return `<div class="cluster" data-l="${l}" data-r="${r}" data-t="${top}" data-b="${bot}">${c.map(tile).join('')}${dots}</div>`;
      }).join('') + loose.map(tile).join('');
      return `<figure class="panel" style="--pw:${g.pw}"><div class="panel-canvas" data-pw="${g.pw}">${inner}</div><figcaption class="panel-cap"><b>${g.label}.</b> ${g.cap}${g.hint ? `<span class="hover-hint"> ${g.hint}</span>` : ''}</figcaption></figure>`;
    }).join('');
    const panels = [...track.querySelectorAll('.panel')];
    // The PDF holds every image on the board, grouped and captioned the same way,
    // laid out as a plain grid. Featured images print larger.
    const pr = document.createElement('div');
    pr.className = 'print-board';
    pr.innerHTML = data.groups.map(g => {
      const figs = g.items.map(t => t.ph
        ? `<figure class="ph"><span>${esc(t.alt)}</span></figure>`
        : `<figure class="${t.print ? (t.pwide ? 'feat wide' : 'feat') : ''}"><img src="${t.src}" alt="${esc(t.alt)}" loading="eager"><figcaption>${t.cap}</figcaption></figure>`).join('');
      const single = g.items.length === 1;
      return `<section class="pgroup${single ? ' single' : ''}">${data.groups.length > 1 || g.cap ? `<p class="pgroup-cap"><b>${g.label}.</b> ${g.cap}</p>` : ''}<div class="pgrid">${figs}</div></section>`;
    }).join('');
    board.after(pr);
    // a board with only placeholders has nothing to open yet
    if (!n) board.querySelector('[data-open]').hidden = true;

    // stacks: the card under the pointer's left-to-right position comes forward
    track.querySelectorAll('.panel-canvas').forEach(canvas => {
      const pw = +canvas.dataset.pw, cls = [...canvas.querySelectorAll('.cluster')];
      if (!cls.length) return;
      const pick = (cl, i) => {
        const ts = [...cl.querySelectorAll('.tile')], ds = [...cl.querySelectorAll('.stack-dots i')];
        ts.forEach((t, k) => t.classList.toggle('sel', k === i)); ds.forEach((d, k) => d.classList.toggle('on', k === i));
        cl.classList.toggle('active', i >= 0); canvas.classList.toggle('stack-on', cls.some(c => c.classList.contains('active')));
      };
      canvas.addEventListener('pointermove', e => {
        const rc = canvas.getBoundingClientRect(), u = rc.width / pw;
        const x = (e.clientX - rc.left) / u, y = (e.clientY - rc.top) / u;
        cls.forEach(cl => {
          const l = +cl.dataset.l, r = +cl.dataset.r, t = +cl.dataset.t, b = +cl.dataset.b;
          if (x < l - 12 || x > r + 12 || y < t - 30 || y > b + 40) { if (cl.classList.contains('active')) pick(cl, -1); return; }
          const count = cl.querySelectorAll('.tile').length;
          pick(cl, Math.max(0, Math.min(count - 1, Math.floor((x - l) / (r - l) * count))));
        });
      });
      canvas.addEventListener('pointerleave', () => cls.forEach(cl => pick(cl, -1)));
    });

    // chips: one per group; hidden when there is only one
    if (panels.length > 1) chipsEl.innerHTML = data.groups.map((g, i) => `<button type="button" class="chip" data-p="${i}">${g.label}</button>`).join('');
    else board.classList.add('single');
    const chips = [...chipsEl.querySelectorAll('.chip')];

    // the track bleeds to the window edges; padding lines the first panel up with the column
    let mode = 'native', dist = 0, stickTop = 0, colW = 0, stickH = 0, pinY = 0, offsets = [0], ticking = false, lastW = 0;
    // scroll-driven CSS animation moves the track on the compositor, in step with the scroll; JS is the fallback
    const sda = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: view()') && CSS.supports('view-timeline-inset: 10px'));
    const layoutBoard = () => {
      lastW = innerWidth;
      const r = board.getBoundingClientRect();
      track.style.setProperty('--bl', r.left + 'px'); track.style.setProperty('--br', Math.max(0, document.documentElement.clientWidth - r.right) + 'px');
      track.style.transform = ''; board.classList.remove('pinned', 'sda'); pin.style.height = ''; stick.style.top = '';
      colW = r.width;
      track.querySelectorAll('img[srcset]').forEach(im => { im.sizes = Math.ceil(im.closest('.tile').offsetWidth * 1.06) + 'px'; });
      offsets = panels.map(p => p.offsetLeft - panels[0].offsetLeft);
      const last = panels[panels.length - 1];
      dist = Math.max(0, offsets[offsets.length - 1] + last.offsetWidth - colW);
      stickH = stick.offsetHeight;
      stickTop = Math.max(66, (innerHeight - stickH) / 2 + 16);
      mode = innerWidth >= 1100 && dist > 0 && stickTop + stickH <= innerHeight - 8 ? 'pin' : 'native';
      if (mode === 'pin') {
        board.classList.add('pinned'); pin.style.height = (stickH + dist) + 'px'; stick.style.top = stickTop + 'px';
        pinY = pin.getBoundingClientRect().top + scrollY;
        if (sda) {
          board.classList.add('sda');
          track.style.setProperty('--dist', dist + 'px');
          pin.style.setProperty('view-timeline-inset', `${stickTop}px ${Math.max(0, innerHeight - stickTop - stickH)}px`);
        }
      } else document.documentElement.classList.remove('board-on');
      update();
    };
    const pos = () => mode === 'pin' ? Math.max(0, Math.min(dist, scrollY - (pinY - stickTop))) : track.scrollLeft;
    let lastA = -1;
    function update() {
      ticking = false;
      const x = pos();
      if (mode === 'pin' && !sda) track.style.transform = `translate3d(${(-x).toFixed(1)}px,0,0)`;
      let a = 0;
      offsets.forEach((v, i) => { if (v <= x + colW * .45) a = i; });
      if (x >= dist - 2) a = panels.length - 1;
      if (a !== lastA) { lastA = a; chips.forEach((c, i) => c.setAttribute('aria-current', i === a ? 'true' : 'false')); }
      const max = mode === 'pin' ? dist : track.scrollWidth - track.clientWidth;
      if (bar && !(mode === 'pin' && sda)) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, x / max).toFixed(4) : 1})`;
      // the bottom blur steps aside while the board is pinned, so its buttons stay sharp
      if (mode === 'pin') { const y = scrollY - (pinY - stickTop); document.documentElement.classList.toggle('board-on', y > -60 && y < dist + 60); }
    }
    const kick = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    addEventListener('scroll', () => { if (mode === 'pin') kick(); }, { passive: true });
    track.addEventListener('scroll', kick, { passive: true });
    // phones change height when the address bar shows or hides; only a width change needs a new layout there
    let rt; addEventListener('resize', () => { if (innerWidth === lastW && innerWidth < 1100) return; clearTimeout(rt); rt = setTimeout(layoutBoard, 120); });
    addEventListener('load', layoutBoard);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutBoard);
    // content above the board can change height (fonts, images); keep the pinned range in step
    if (window.ResizeObserver) { let rh; new ResizeObserver(() => { clearTimeout(rh); rh = setTimeout(() => { if (mode === 'pin') pinY = pin.getBoundingClientRect().top + scrollY; }, 100); }).observe(document.body); }
    layoutBoard();

    const goTo = i => {
      const x = Math.min(offsets[i], mode === 'pin' ? dist : Infinity);
      if (mode === 'pin') scrollTo({ top: pinY - stickTop + x + (x > 0 ? 1 : 0), behavior: reduce ? 'auto' : 'smooth' });
      else track.scrollTo({ left: x, behavior: reduce ? 'auto' : 'smooth' });
    };
    chips.forEach((c, i) => c.addEventListener('click', () => goTo(i)));
    track.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const cur = chips.findIndex(c => c.getAttribute('aria-current') === 'true');
      goTo(Math.max(0, Math.min(panels.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1))));
    });
    // a sideways trackpad swipe over a pinned board scrolls the page
    stick.addEventListener('wheel', e => { if (mode === 'pin' && Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); scrollBy({ top: e.deltaX, behavior: 'instant' }); } }, { passive: false });

    // drag with a mouse; a drag never opens an image
    let sx = null, s0 = 0, moved = 0;
    track.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; sx = e.clientX; s0 = mode === 'pin' ? scrollY : track.scrollLeft; moved = 0; });
    addEventListener('pointermove', e => {
      if (sx === null) return; moved = e.clientX - sx;
      if (Math.abs(moved) > 5) { track.classList.add('dragging'); if (mode === 'pin') scrollTo({ top: s0 - moved, behavior: 'instant' }); else track.scrollLeft = s0 - moved; }
    });
    addEventListener('pointerup', () => { if (sx === null) return; sx = null; setTimeout(() => track.classList.remove('dragging'), 0); });
    track.addEventListener('click', e => {
      if (Math.abs(moved) > 5) { moved = 0; return; }
      const cl = e.target.closest('.cluster.active');
      const t = cl ? cl.querySelector('.tile.sel') : e.target.closest('.tile[data-i]');
      if (t) openGallery(key, +t.dataset.i, t.querySelector('.face'));
    });
    board.querySelector('[data-open]').addEventListener('click', () => openGallery(key, 0, null));
  });

  /* Gallery overlay */
  const gal = document.getElementById('gallery'); if (!gal) return;
  const stage = gal.querySelector('.gal-stage'), track = gal.querySelector('.gal-track');
  const cap = gal.querySelector('.gal-cap'), count = gal.querySelector('.gal-count'), ttl = gal.querySelector('.gal-title'), grp = gal.querySelector('.gal-group');
  const zoom = gal.querySelector('.gal-zoom'), zimg = zoom.querySelector('img');
  let items = [], slides = [], cur = 0, x = 0, target = 0, stepW = 1, slideW = 1, raf = 0, last = 0, open = false, lastFocus = null, idleT = 0, shown = -1;

  const flat = key => { const out = []; G[key].groups.forEach(g => g.items.forEach(t => { if (!t.ph) out.push({ ...t, group: g.label }); })); return out; };
  const sizes = () => {
    const bh = gal.querySelector('.gal-bar').offsetHeight, fh = gal.querySelector('.gal-foot').offsetHeight;
    track.style.setProperty('--gt', bh + 'px'); track.style.setProperty('--gb', fh + 'px');
    const sw = stage.clientWidth, H = (stage.clientHeight - bh - fh) * .94, cap = Math.min(sw * (innerWidth < 760 ? .9 : .66), 1100);
    slideW = cap;
    stepW = slideW + Math.max(24, sw * .03);
    track.style.paddingLeft = (sw - slideW) / 2 + 'px';
    slides.forEach((s, i) => {
      const t = items[i], ar = t.nh / t.nw, fr = s.querySelector('.g-frame');
      s.style.width = slideW + 'px'; s.style.marginRight = (stepW - slideW) + 'px';
      // fit the whole image in the stage; a sheet that would shrink below half width scrolls instead
      const fitW = Math.min(slideW, H / ar, t.nw || Infinity), readW = Math.min(slideW, 900, t.nw || Infinity);
      const tall = ar > 1.2 && fitW < readW * .6;
      s.classList.toggle('tall', tall);
      fr.style.width = (tall ? readW : fitW) + 'px';
      fr.style.height = (tall ? H : fitW * ar) + 'px';
    });
  };
  const paint = () => {
    track.style.transform = `translate3d(${-x}px,0,0)`;
    const f = x / stepW;
    for (let i = 0; i < slides.length; i++) {
      const d = Math.abs(i - f), s = slides[i];
      if (d > 2.6) { if (s._v !== 0) { s.style.opacity = 0; s._v = 0; } continue; }
      s._v = 1;
      s.style.transform = `scale(${1 - Math.min(d, 1) * .26})`;
      s.style.opacity = (1 - Math.min(d, 2) * .38).toFixed(3);
    }
    const now = Math.round(f);
    if (now !== shown) {
      shown = now;
      slides.forEach((s, i) => s.classList.toggle('active', i === now));
      const t = items[now]; if (t) { cap.textContent = t.cap; grp.textContent = t.group; count.textContent = `${now + 1} / ${items.length}`; }
    }
  };
  const loop = ts => {
    const dt = Math.min(64, ts - (last || ts)); last = ts;
    const k = reduce ? 1 : 1 - Math.pow(1 - .16, dt / 16.7);
    x += (target - x) * k;
    if (Math.abs(target - x) < .4) { x = target; paint(); raf = 0; last = 0; track.classList.remove('moving'); return; }
    paint(); raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!raf) { track.classList.add('moving'); raf = requestAnimationFrame(loop); } };
  const clampX = v => Math.max(0, Math.min(v, (items.length - 1) * stepW));
  const go = i => { cur = Math.max(0, Math.min(items.length - 1, i)); target = cur * stepW; kick(); };
  const settle = () => go(Math.round(target / stepW));
  const syncCur = () => { cur = Math.max(0, Math.min(items.length - 1, Math.round(target / stepW))); };

  function openGallery(key, i, fromEl) {
    items = flat(key); cur = Math.max(0, Math.min(items.length - 1, i));
    ttl.textContent = G[key].title;
    track.innerHTML = items.map(t => `<figure class="g-slide"><div class="g-frame"><img src="${t.src}" alt="${esc(t.alt)}" draggable="false"></div><span class="hint">Scroll for the full sheet</span></figure>`).join('');
    slides = [...track.children];
    lastFocus = document.activeElement;
    const sbw = innerWidth - document.documentElement.clientWidth;
    document.documentElement.classList.add('locked'); document.documentElement.style.paddingRight = sbw + 'px';
    gal.classList.add('on'); open = true; shown = -1;
    sizes();
    slides.forEach(s => { const f = s.querySelector('.g-frame'); f.addEventListener('scroll', () => s.classList.toggle('scrolled', f.scrollTop > 20), { passive: true }); });
    x = target = cur * stepW; paint();
    // the clicked card grows into place
    const fr = slides[cur].querySelector('.g-frame');
    if (fromEl && fr && !reduce) {
      const a = fromEl.getBoundingClientRect(), b = fr.getBoundingClientRect();
      const sc = a.width / b.width;
      fr.style.transition = 'none';
      fr.style.transformOrigin = '0 0';
      fr.style.transform = `translate(${a.left - b.left}px,${a.top - b.top}px) scale(${sc},${a.height / b.height})`;
      fr.getBoundingClientRect();
      fr.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1)';
      fr.style.transform = '';
      setTimeout(() => { fr.style.transition = ''; fr.style.transformOrigin = ''; }, 650);
    }
    gal.querySelector('.gal-close').focus({ preventScroll: true });
  }
  const closeGallery = () => {
    if (zoom.classList.contains('on')) return unzoom();
    gal.classList.remove('on'); open = false;
    cancelAnimationFrame(raf); raf = 0;
    setTimeout(() => { document.documentElement.classList.remove('locked'); document.documentElement.style.paddingRight = ''; }, 380);
    lastFocus && lastFocus.focus({ preventScroll: true });
  };
  const zoomIn = () => { const t = items[shown]; if (!t) return; zimg.src = t.src; zimg.alt = t.alt; zimg.style.maxWidth = Math.min(t.nw, 1600) + 'px'; zoom.scrollTop = 0; zoom.classList.add('on'); zoom.setAttribute('aria-hidden', 'false'); zoom.querySelector('.gal-unzoom').focus({ preventScroll: true }); };
  function unzoom() { zoom.classList.remove('on'); zoom.setAttribute('aria-hidden', 'true'); }

  // wheel: a mouse notch moves one image; a trackpad glides and settles on the nearest image
  stage.addEventListener('wheel', e => {
    const vertical = Math.abs(e.deltaY) >= Math.abs(e.deltaX);
    const sc = e.target.closest('.g-slide.active.tall .g-frame');
    if (sc && vertical) {
      const atTop = sc.scrollTop <= 0, atEnd = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2;
      if ((e.deltaY > 0 && !atEnd) || (e.deltaY < 0 && !atTop)) return;
    }
    e.preventDefault();
    const d = (vertical ? e.deltaY : e.deltaX) * (e.deltaMode === 1 ? 33 : 1);
    if (Math.abs(d) >= 50 && e.deltaMode !== 0 || Math.abs(d) >= 80) { go(cur + Math.sign(d)); return; }
    target = clampX(target + d * 1.4); syncCur(); kick();
    clearTimeout(idleT); idleT = setTimeout(settle, 160);
  }, { passive: false });

  // drag / swipe with momentum
  let dx0 = null, t0 = 0, xs = 0, vel = 0, lastX = 0, lastT = 0, dragged = 0;
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('.g-slide.active.tall .g-frame') && e.pointerType === 'mouse') return;
    dx0 = e.clientX; t0 = target; dragged = 0; vel = 0; lastX = e.clientX; lastT = performance.now();
  });
  addEventListener('pointermove', e => {
    if (dx0 === null) return;
    dragged = e.clientX - dx0;
    if (Math.abs(dragged) > 4) { stage.classList.add('dragging'); track.classList.add('moving'); }
    const now = performance.now(); vel = (e.clientX - lastX) / Math.max(1, now - lastT); lastX = e.clientX; lastT = now;
    target = clampX(t0 - dragged); syncCur(); x = target; paint();
  });
  addEventListener('pointerup', () => {
    if (dx0 === null) return; dx0 = null; stage.classList.remove('dragging');
    if (Math.abs(dragged) > 4) go(Math.round((target - vel * 220) / stepW));
  });

  // clicks: side image comes forward, front image opens full size, empty space closes
  stage.addEventListener('click', e => {
    if (Math.abs(dragged) > 4) { dragged = 0; return; }
    const s = e.target.closest('.g-slide');
    const onImage = e.target.closest('.g-frame');
    if (!s || !onImage) { closeGallery(); return; }
    const i = slides.indexOf(s);
    if (i !== shown) go(i); else if (!s.classList.contains('tall')) zoomIn();
  });
  // hover: the front image lifts and leans toward the pointer; the frame scales with it, so nothing is cropped
  stage.addEventListener('pointermove', e => {
    if (reduce || dx0 !== null) return;
    const f = e.target.closest('.g-slide.active .g-frame');
    slides.forEach(s => { const fr = s.querySelector('.g-frame'); if (fr !== f && fr) { fr.style.scale = ''; fr.style.translate = ''; } });
    if (!f || f.closest('.tall')) { if (f) f.style.scale = '1.015'; return; }
    const r = f.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
    f.style.scale = '1.04'; f.style.translate = `${(px * 10).toFixed(1)}px ${(py * 10).toFixed(1)}px`;
  });
  stage.addEventListener('pointerleave', () => slides.forEach(s => { const fr = s.querySelector('.g-frame'); if (fr) { fr.style.scale = ''; fr.style.translate = ''; } }));

  gal.querySelector('.gal-full').addEventListener('click', zoomIn);
  zoom.addEventListener('click', unzoom);
  gal.querySelector('.gal-prev').addEventListener('click', () => go(cur - 1));
  gal.querySelector('.gal-next').addEventListener('click', () => go(cur + 1));
  gal.querySelector('.gal-close').addEventListener('click', closeGallery);
  addEventListener('keydown', e => {
    if (!open) return;
    if (e.key === 'Escape') closeGallery();
    else if (zoom.classList.contains('on')) return;
    else if (e.key === 'ArrowRight') go(cur + 1);
    else if (e.key === 'ArrowLeft') go(cur - 1);
  });
  addEventListener('resize', () => { if (!open) return; sizes(); x = target = shown * stepW; paint(); });
}

/* ---------- Section motion: word-by-word headings, reveal on scroll, sticky header state ---------- */
function motion() {
  document.documentElement.classList.add('js');
  document.querySelectorAll('.display').forEach(h => {
    h.innerHTML = h.textContent.trim().split(/\s+/).map((w, i) => `<span class="w"><span style="transition-delay:${i * 60}ms">${w}</span></span>`).join(' ');
  });
  // stacked tables on small screens label each cell with its column
  document.querySelectorAll('.scroll table').forEach(tb => {
    const heads = [...tb.querySelectorAll('thead th')].map(th => th.textContent.trim());
    tb.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((cell, i) => { if (cell.tagName === 'TD') cell.dataset.label = heads[i] || ''; }));
  });
  const targets = document.querySelectorAll('.reveal, .display, .exp-head');
  if (!('IntersectionObserver' in window)) { targets.forEach(t => t.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
  targets.forEach(t => io.observe(t));
  addEventListener('beforeprint', () => targets.forEach(t => t.classList.add('in')));
  const top = document.getElementById('site-top');
  const onScroll = () => top && top.classList.toggle('scrolled', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
}

motion(); ascii(); cites(); galleries();
})();
