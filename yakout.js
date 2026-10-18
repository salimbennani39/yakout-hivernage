/* Yakout Hivernage: page-local behaviour. The engine is untouched; this reads
   scroll and pointer itself and writes custom properties the CSS consumes. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const vh = () => window.innerHeight;

  // Progress through a pinned section's travel, 0..1.
  const pinP = (el) => {
    const r = el.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, r.height - vh()));
  };
  const onScreen = (el) => { const r = el.getBoundingClientRect(); return r.bottom > -50 && r.top < vh() + 50; };

  /* ------------------------------------------------------------ dishes -- */
  const DISHES = {
    poulet:   { fr: 'Poulet, citron confit & olives', wa: 'tajine de poulet au citron confit', desc: 'Chicken braised slowly with preserved lemon and green olives, in a golden sauce.', src: 'assets/dish-chicken.webp' },
    agneau:   { fr: 'Agneau, pruneaux & amandes', wa: "tajine d'agneau aux pruneaux et amandes", desc: 'Lamb cooked until tender with prunes, toasted almonds and sesame. Sweet, savoury, unmistakably Moroccan.', src: 'assets/dish-lamb.webp' },
    couscous: { fr: 'Couscous aux sept légumes', wa: 'couscous aux sept légumes', desc: 'Fine semolina under seven vegetables, chickpeas, caramelised onions and raisins.', src: 'assets/dish-couscous.webp' },
  };
  const state = { dish: 'poulet', guests: 2, when: 'tonight' };

  /* ------------------------------------------------------------- tiles -- */
  const tiles = $$('.tile');
  const secs = $$('[data-stage-sec]');
  const reached = new Set();
  function updateTiles() {
    let now = null;
    for (const s of secs) {
      const r = s.getBoundingClientRect();
      if (r.top < vh() * 0.6) { reached.add(s.dataset.stageSec); if (r.bottom > vh() * 0.4) now = s.dataset.stageSec; }
    }
    for (const t of tiles) {
      t.classList.toggle('is-glazed', reached.has(t.dataset.stage));
      const isNow = t.dataset.stage === now;
      t.classList.toggle('is-now', isNow);
      if (isNow) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current');
    }
  }

  /* -------------------------------------------------------------- hero -- */
  const hero = $('.hero');
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  if (fine && !reduce) {
    addEventListener('pointermove', (e) => {
      ptr.tx = (e.clientX / innerWidth) * 2 - 1;
      ptr.ty = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });
  }

  // Lantern light drifting upward in the garden, a few dozen motes.
  const motesC = $('.hero__motes');
  const mctx = motesC.getContext('2d');
  let motes = [];
  function sizeCanvas(c, ctx) {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  }
  let mrect = sizeCanvas(motesC, mctx);
  function seedMotes() {
    motes = Array.from({ length: innerWidth < 860 ? 18 : 34 }, () => ({
      x: Math.random() * mrect.width, y: Math.random() * mrect.height,
      r: 0.8 + Math.random() * 2.2, v: 0.12 + Math.random() * 0.35, ph: Math.random() * 6.28,
    }));
  }
  seedMotes();
  function drawMotes(t) {
    mctx.clearRect(0, 0, mrect.width, mrect.height);
    for (const m of motes) {
      m.y -= m.v; m.x += Math.sin(t / 1400 + m.ph) * 0.18;
      if (m.y < -10) { m.y = mrect.height + 10; m.x = Math.random() * mrect.width; }
      const a = 0.35 + 0.35 * Math.sin(t / 700 + m.ph);
      mctx.fillStyle = `rgba(255,196,120,${a})`;
      mctx.beginPath(); mctx.arc(m.x, m.y, m.r, 0, 6.283); mctx.fill();
    }
  }

  /* -------------------------------------------------------------- peak -- */
  const peak = $('#tajine');
  const stage = $('.peak__stage', peak);
  const scene = $('[data-scene]', peak);
  const lid = $('[data-lid]', peak);
  const dishImgs = $$('.scene__dish', peak);
  const picks = $$('[data-pick]', peak);
  const desc = $('[data-desc]', peak);
  const steamC = $('.scene__steam', peak);
  const sctx = steamC.getContext('2d');
  let srect = sizeCanvas(steamC, sctx);

  // Scroll alone walks through all three dishes: open, close, swap, open.
  const SCRIPT = [
    { dish: 'poulet',   from: 0.00, open: [0.05, 0.20], close: [0.33, 0.39] },
    { dish: 'agneau',   from: 0.39, open: [0.42, 0.52], close: [0.62, 0.68] },
    { dish: 'couscous', from: 0.68, open: [0.71, 0.81], close: [2, 2] },
  ];
  function scripted(p) {
    let seg = SCRIPT[0];
    for (const s of SCRIPT) if (p >= s.from) seg = s;
    const lift = smooth(seg.open[0], seg.open[1], p) * (1 - smooth(seg.close[0], seg.close[1], p));
    return { dish: seg.dish, lift };
  }

  const lidS = { lift: 0, prev: 0, userPick: null, manual: null, manualAt: 0, drag: null, tween: null };
  let lastP = 0;

  function showDish(key) {
    if (state.dish === key && dishImgs.some(i => i.dataset.dish === key && i.classList.contains('is-on'))) return;
    state.dish = key;
    for (const i of dishImgs) i.classList.toggle('is-on', i.dataset.dish === key);
    for (const b of picks) b.setAttribute('aria-checked', String(b.dataset.pick === key));
    desc.textContent = DISHES[key].desc;
    syncClose();
  }

  function pick(key) {
    lidS.userPick = key;
    lidS.manual = null;
    if (reduce) { showDish(key); return; }
    // Lid down, swap underneath, lid up again.
    const start = performance.now();
    const from = lidS.lift;
    lidS.tween = (now) => {
      const t = (now - start);
      if (t < 260) return from * (1 - smooth(0, 260, t));
      if (state.dish !== key) showDish(key);
      if (t < 360) return 0;
      if (t < 1060) return smooth(360, 1060, t);
      lidS.tween = null; lidS.manual = 1; lidS.manualAt = lastP;
      return 1;
    };
  }
  picks.forEach(b => b.addEventListener('click', () => pick(b.dataset.pick)));
  // Arrow keys move through the radio group.
  picks.forEach((b, i) => b.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = picks[(i + d + picks.length) % picks.length];
    n.focus(); pick(n.dataset.pick);
  }));

  lid.addEventListener('click', () => {
    if (lidS.dragMoved) { lidS.dragMoved = false; return; }
    lidS.manual = lidS.lift > 0.5 ? 0 : 1; lidS.manualAt = lastP;
  });
  lid.addEventListener('pointerdown', (e) => {
    lidS.drag = { y: e.clientY, start: lidS.lift, h: lid.getBoundingClientRect().height };
    lidS.dragMoved = false;
  });
  addEventListener('pointermove', (e) => {
    if (!lidS.drag) return;
    const dy = lidS.drag.y - e.clientY;
    if (Math.abs(dy) > 4) lidS.dragMoved = true;
    lidS.manual = clamp(lidS.drag.start + dy / (lidS.drag.h * 0.55));
    lidS.manualAt = lastP;
  }, { passive: true });
  const endDrag = () => {
    if (!lidS.drag) return;
    lidS.drag = null;
    // Let go high and it stays open; let go low and it settles back on.
    if (lidS.manual != null) lidS.manual = lidS.manual > 0.45 ? 1 : 0;
  };
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);

  // Steam: soft puffs that rise from under the lid, more when it moves fast.
  let puffs = [];
  function emit(n, lift) {
    const W = srect.width, H = srect.height;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      puffs.push({
        x: W * (0.6213 + Math.cos(a) * 0.09 * Math.random()),
        y: H * (0.47 + Math.sin(a) * 0.06 * Math.random()) - lift * H * 0.06,
        vx: (Math.random() - 0.5) * 0.35, vy: -(0.5 + Math.random() * 0.9) * (W / 1400),
        r: W * (0.012 + Math.random() * 0.014), g: W * 0.000032 * (0.7 + Math.random()),
        life: 0, dur: 2200 + Math.random() * 2200, ph: Math.random() * 6.28,
      });
    }
    if (puffs.length > 90) puffs.splice(0, puffs.length - 90);
  }
  function drawSteam(dt, t) {
    sctx.clearRect(0, 0, srect.width, srect.height);
    for (const s of puffs) {
      s.life += dt / s.dur;
      s.x += s.vx + Math.sin(t / 900 + s.ph) * 0.25; s.y += s.vy; s.r += s.g * dt;
      const a = Math.sin(Math.PI * clamp(s.life)) * 0.085;
      if (a <= 0.002) continue;
      const g = sctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      g.addColorStop(0, `rgba(255,248,238,${a})`);
      g.addColorStop(1, 'rgba(255,248,238,0)');
      sctx.fillStyle = g;
      sctx.beginPath(); sctx.arc(s.x, s.y, s.r, 0, 6.283); sctx.fill();
    }
    puffs = puffs.filter(s => s.life < 1);
  }

  function updatePeak(dt, t) {
    const p = pinP(peak);
    const sc = scripted(p);
    // Scrolling on after a manual choice hands the lid back to the scroll.
    if (lidS.manual != null && !lidS.drag && !lidS.tween && Math.abs(p - lidS.manualAt) > 0.04) lidS.manual = null;
    let target;
    if (lidS.tween) target = lidS.tween(t);
    else if (lidS.manual != null) target = lidS.manual;
    else if (lidS.userPick) target = smooth(0.05, 0.2, p);
    else target = sc.lift;
    if (!lidS.userPick && !lidS.tween) showDish(sc.dish);
    if (reduce) target = 1;
    lidS.prev = lidS.lift;
    lidS.lift += (target - lidS.lift) * (reduce || lidS.drag || lidS.tween ? 1 : 0.22);
    if (Math.abs(target - lidS.lift) < 0.001) lidS.lift = target;
    peak.style.setProperty('--lift', lidS.lift.toFixed(4));
    lastP = p;
    if (!reduce) {
      const rise = Math.max(0, lidS.lift - lidS.prev);
      const rate = lidS.lift * 0.12 + rise * 26;
      let n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
      if (n) emit(Math.min(n, 5), lidS.lift);
      drawSteam(dt, t);
    }
    stage.dataset.scVerifyState = `${state.dish}:${lidS.lift.toFixed(2)}`;
  }

  /* ------------------------------------------------------------- close -- */
  const miniDish = $('[data-mini-dish]');
  const cardDish = $('[data-card-dish]');
  const wa = $('[data-wa]');
  const out = $('[data-guests-out]');
  const WHEN = { tonight: 'ce soir', tomorrow: 'demain', weekend: 'ce week-end' };
  function syncClose() {
    const d = DISHES[state.dish];
    if (!miniDish.src.endsWith(d.src)) miniDish.src = d.src;
    cardDish.textContent = d.fr;
    out.value = out.textContent = state.guests;
    const msg = `Bonjour Yakout Hivernage, je voudrais réserver une table pour ${state.guests} ${state.guests > 1 ? 'personnes' : 'personne'} ${WHEN[state.when]}. On pense déjà au ${d.wa}.`;
    wa.href = `https://wa.me/212660600548?text=${encodeURIComponent(msg)}`;
  }
  $$('[data-guests]').forEach(b => b.addEventListener('click', () => {
    state.guests = clamp(state.guests + Number(b.dataset.guests), 1, 20); syncClose();
  }));
  const whens = $$('[data-when]');
  whens.forEach(b => b.addEventListener('click', () => {
    state.when = b.dataset.when;
    whens.forEach(x => x.setAttribute('aria-checked', String(x === b)));
    syncClose();
  }));
  syncClose();

  // A thread of steam from the closed lid: the dish is being kept warm.
  const miniC = $('.mini__steam');
  const mnctx = miniC.getContext('2d');
  let mnrect = sizeCanvas(miniC, mnctx);
  let wisps = [];
  function drawMini(dt, t) {
    const W = mnrect.width, H = mnrect.height;
    if (Math.random() < 0.12) wisps.push({ x: W * 0.62 + (Math.random() - 0.5) * W * 0.03, y: H * 0.24, r: W * 0.01, life: 0, dur: 2600 + Math.random() * 1600, ph: Math.random() * 6 });
    mnctx.clearRect(0, 0, W, H);
    for (const s of wisps) {
      s.life += dt / s.dur; s.y -= W * 0.0006 * dt / 16; s.r += W * 0.00012 * dt / 16; s.x += Math.sin(t / 700 + s.ph) * 0.3;
      const a = Math.sin(Math.PI * clamp(s.life)) * 0.16;
      const g = mnctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      g.addColorStop(0, `rgba(255,248,238,${a})`); g.addColorStop(1, 'rgba(255,248,238,0)');
      mnctx.fillStyle = g; mnctx.beginPath(); mnctx.arc(s.x, s.y, s.r, 0, 6.283); mnctx.fill();
    }
    wisps = wisps.filter(s => s.life < 1);
  }

  /* -------------------------------------------------------------- loop -- */
  addEventListener('resize', () => {
    mrect = sizeCanvas(motesC, mctx); seedMotes();
    srect = sizeCanvas(steamC, sctx); mnrect = sizeCanvas(miniC, mnctx);
  });
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(50, t - last); last = t;
    updateTiles();
    if (onScreen(hero)) {
      const p = pinP(hero);
      ptr.x += (ptr.tx - ptr.x) * 0.06; ptr.y += (ptr.ty - ptr.y) * 0.06;
      hero.style.setProperty('--p', reduce ? 0 : p.toFixed(4));
      hero.style.setProperty('--mx', ptr.x.toFixed(3));
      hero.style.setProperty('--my', ptr.y.toFixed(3));
      if (!reduce) drawMotes(t);
    }
    if (onScreen(peak)) updatePeak(dt, t);
    if (!reduce && onScreen(miniC)) drawMini(dt, t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
