// The home page's breathing figure: a seated meditator made of particles, sitting on a
// waterline, breathing on a six-second cycle.
//   - the silhouette is drawn once offscreen and sampled into particles (denser at the edges),
//   - the figure swells slightly on the inhale, with a soft glow that follows the breath,
//   - particles are a glowing mix of teal, cyan, lavender and orchid, added together as light,
//   - ripples spread across the water and the figure is reflected below the waterline,
//   - "thoughts" rise from the crown and dissolve from teal into lavender,
//   - the pointer gently parts the particles,
//   - a label under the figure says Inhale / Exhale, swapping words while it is faded out.
// The canvas covers the whole hero (transparent, no pointer events) and the figure is placed on
// the hero's figure column, so nothing is clipped at a column edge and the glow blends into the
// silk. Runs only while visible; a single
// still frame when the visitor prefers reduced motion. Palette = the site's violet/teal family.

import { reducedMotion, whileVisible } from "../core/dom.js";

const PALETTE = {
  main: [143, 211, 209],     // teal: the figure's base colour, ripples and waterline
  thought: [176, 150, 236],  // what rising thoughts fade into
  glow: [92, 100, 228],      // the breath glow: a wide blue-violet light, added to the scene
};
// Particle colours and how often each appears (the colourful mix of the original figure).
const DOTS = [
  [[236, 246, 255], 0.36],   // near-white
  [[168, 226, 255], 0.32],   // ice blue
  [[143, 211, 209], 0.14],   // teal
  [[199, 180, 240], 0.12],   // lavender
  [[236, 143, 214], 0.06],   // orchid, a rare warm spark
];
const pickDot = () => {
  let r = Math.random();
  for (const [c, w] of DOTS) if ((r -= w) <= 0) return c;
  return DOTS[0][0];
};
const CYCLE = 6;          // seconds per breath
const FIG_BOTTOM = 336;   // silhouette y that sits on the waterline
const THOUGHTS = 220;

const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;

function sampleSilhouette() {
  const S = 400, off = document.createElement("canvas");
  off.width = off.height = S;
  const g = off.getContext("2d", { willReadFrequently: true });
  g.fillStyle = g.strokeStyle = "#fff";
  g.lineCap = g.lineJoin = "round";
  g.beginPath(); g.arc(200, 92, 30, 0, Math.PI * 2); g.fill();                // head
  g.fillRect(188, 115, 24, 32);                                                // neck
  g.beginPath();                                                               // torso
  g.moveTo(148, 152); g.quadraticCurveTo(200, 136, 252, 152);
  g.lineTo(238, 266); g.quadraticCurveTo(200, 276, 162, 266);
  g.closePath(); g.fill();
  g.lineWidth = 24;                                                            // arms
  g.beginPath(); g.moveTo(152, 160); g.quadraticCurveTo(116, 216, 140, 262); g.lineTo(178, 290); g.stroke();
  g.beginPath(); g.moveTo(248, 160); g.quadraticCurveTo(284, 216, 260, 262); g.lineTo(222, 290); g.stroke();
  g.beginPath(); g.ellipse(200, 300, 135, 36, 0, 0, Math.PI * 2); g.fill();    // crossed legs

  const d = g.getImageData(0, 0, S, S).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < S && y < S && d[(y * S + x) * 4 + 3] > 128;
  const pts = [];
  for (let y = 0; y < S; y += 3) {
    for (let x = 0; x < S; x += 3) {
      if (!on(x, y)) continue;
      const edge = !on(x, y - 6) || !on(x, y + 6) || !on(x - 6, y) || !on(x + 6, y);
      const copies = edge && Math.random() < 0.5 ? 2 : 1;   // denser, brighter outline
      for (let c = 0; c < copies && (edge || Math.random() < 0.55); c++) {
        pts.push({
          hx: x + Math.random() * 3, hy: y + Math.random() * 3, edge,
          dx: 0, dy: 0, vx: 0, vy: 0,
          ph: Math.random() * Math.PI * 2, sp: 0.6 + Math.random() * 1.6,
          size: edge ? 1.9 : 1.3,
          col: rgb(pickDot()),
          halo: edge && Math.random() < 0.22,     // soft light around outline dots
          glint: edge && Math.random() < 0.035,   // a few star-like sparkles on the outline
        });
      }
    }
  }
  return pts;
}

function spawnThought(p, t) {
  p.x = 200 + (Math.random() - 0.5) * 36;
  p.y = 66 + Math.random() * 8;
  p.vy = -(0.22 + Math.random() * 0.3);
  p.seed = Math.random() * 1000;
  p.born = t;
  p.life = 7 + Math.random() * 6;
  p.size = 0.8 + Math.random() * 1.3;
}

export function startMeditator(canvas, label, anchor) {
  const root = canvas.parentElement;   // the hero: canvas covers it entirely
  const ctx = canvas.getContext("2d");
  const figure = sampleSilhouette();
  const thoughts = Array.from({ length: THOUGHTS }, () => {
    const p = {};
    spawnThought(p, 0);
    const age = Math.random() * p.life;          // start mid-flight so it never looks empty
    p.born = -age;
    p.y += p.vy * 60 * age;
    p.x += (Math.random() - 0.5) * age * 10;
    return p;
  });
  const pointer = { x: -9999, y: -9999 };
  let W = 0, H = 0, scale = 1, cx = 0, baseY = 0, fadeTop = 0;

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = root.clientWidth; H = root.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Place the figure on its column (the anchor), measured relative to the hero.
    const r = root.getBoundingClientRect(), a = (anchor || root).getBoundingClientRect();
    const aw = a.width || W, ah = a.height || H;
    const beside = a.left - r.left > W * 0.35;   // two-column layout: figure beside the text
    cx = a.left - r.left + aw / 2;
    // The silhouette is ~270 units wide and ~274 tall. Beside the text it fills about half the
    // hero's height (limited by its column's width); stacked, it fills most of its own box.
    if (beside) {
      scale = Math.min(aw / 290, (H * 0.5) / 274);
      baseY = Math.min(H * 0.7, H - 0.5 * 274 * scale - 24);   // leave room for the reflection
    } else {
      scale = Math.min(aw / 300, (ah * 0.8) / 274);
      baseY = a.top - r.top + ah * 0.86;
    }
    // Rising thoughts fade out before any text above the figure. Beside the text nothing is above
    // it, so they may rise almost to the header.
    fadeTop = beside ? 72 : a.top - r.top;
    if (label) {
      const dts = beside ? [...document.querySelectorAll(".hero .stats dt")] : [];
      const row = dts.reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0);
      label.style.bottom = row ? `${Math.round(a.bottom - row)}px` : "";
    }
  }

  let lastBreath = -1;
  function draw(t, dt) {
    const ph = (t % CYCLE) / CYCLE;
    const n = Math.floor(t / CYCLE);
    if (n !== lastBreath) {            // a new inhale begins
      if (lastBreath >= 0) canvas.dispatchEvent(new CustomEvent("breath", { detail: { n } }));
      lastBreath = n;
    }
    const b = (1 - Math.cos(ph * Math.PI * 2)) / 2;        // 0 -> 1 -> 0 over one breath
    const k = scale * (1 + 0.03 * b);
    const headY = baseY - (FIG_BOTTOM - 92) * k;   // centre of the head

    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);

    ctx.globalAlpha = 1;                                  // glow that swells with the inhale
    // A wide, even blue-violet light around the whole figure (not a spot), swelling on the inhale,
    // plus a faint ice-blue core on the body so the outline reads as lit from within.
    const bodyY = baseY - 130 * k;
    ctx.globalCompositeOperation = "lighter";      // brighten the scene around the figure, never darken it
    const glow = ctx.createRadialGradient(cx, bodyY, 0, cx, bodyY, (330 + 30 * b) * k);
    glow.addColorStop(0, rgba(PALETTE.glow, 0.3 + 0.12 * b));
    glow.addColorStop(0.5, rgba(PALETTE.glow, 0.16 + 0.07 * b));
    glow.addColorStop(1, rgba(PALETTE.glow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    const core = ctx.createRadialGradient(cx, bodyY, 0, cx, bodyY, 150 * k);
    core.addColorStop(0, rgba([150, 200, 255], 0.07 + 0.04 * b));
    core.addColorStop(1, rgba([150, 200, 255], 0));
    ctx.fillStyle = core;
    ctx.fillRect(cx - 160 * k, bodyY - 160 * k, 320 * k, 320 * k);
    ctx.globalCompositeOperation = "source-over";

    ctx.globalAlpha = 1;                                  // waterline
    const span = 420 * scale;                       // waterline centred on the figure, not the hero
    const hz = ctx.createLinearGradient(cx - span, 0, cx + span, 0);
    hz.addColorStop(0, rgba(PALETTE.main, 0));
    hz.addColorStop(0.5, rgba(PALETTE.main, 0.22));
    hz.addColorStop(1, rgba(PALETTE.main, 0));
    ctx.fillStyle = hz;
    ctx.fillRect(cx - span, baseY, span * 2, 1);

    ctx.strokeStyle = rgb(PALETTE.main);                  // breath ripples on the water
    for (let i = 0; i < 3; i++) {
      const p = ((t / CYCLE) + i / 3) % 1;
      const r = (70 + p * 380) * scale;
      ctx.globalAlpha = Math.pow(1 - p, 2) * 0.35;
      ctx.beginPath(); ctx.ellipse(cx, baseY + 6, r, r * 0.11, 0, 0, Math.PI * 2); ctx.stroke();
    }

    const R = 90, maxDepth = 400 * k;                     // the figure and its reflection
    for (const p of figure) {
      const sx = cx + (p.hx - 200) * k;
      const sy = baseY - (FIG_BOTTOM - p.hy) * k;
      const ddx = sx + p.dx - pointer.x, ddy = sy + p.dy - pointer.y;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < R * R) {
        const d = Math.sqrt(d2) || 1, f = (1 - d / R) * 2.2;
        p.vx += (ddx / d) * f; p.vy += (ddy / d) * f;
      }
      p.vx = (p.vx - p.dx * 0.02) * 0.9;
      p.vy = (p.vy - p.dy * 0.02) * 0.9;
      p.dx += p.vx * dt; p.dy += p.vy * dt;

      const x = sx + p.dx + Math.sin(t * 0.6 + p.ph) * 0.8;
      const y = sy + p.dy + Math.cos(t * 0.5 + p.ph * 1.3) * 0.8;
      // Crisp, bright outline; the interior stays dim so the silhouette reads first.
      const tw = 0.55 + 0.45 * Math.sin(t * p.sp + p.ph);
      const a = (p.edge ? 1 : 0.38) * tw;
      ctx.fillStyle = p.col;
      ctx.globalAlpha = a;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillRect(x, y, p.size, p.size);
      if (p.halo) {
        ctx.globalAlpha = a * 0.16;
        ctx.beginPath(); ctx.arc(x + p.size / 2, y + p.size / 2, 4, 0, 6.283); ctx.fill();
      }
      if (p.glint) {                                       // four-point sparkle that flares briefly
        const f = Math.pow(Math.max(0, Math.sin(t * p.sp * 0.7 + p.ph)), 8);
        if (f > 0.02) {
          const L = 3 + 7 * f, gx = x + p.size / 2, gy = y + p.size / 2;
          ctx.globalAlpha = 0.9 * f;
          ctx.fillRect(gx - L, gy - 0.5, L * 2, 1);
          ctx.fillRect(gx - 0.5, gy - L, 1, L * 2);
        }
      }
      ctx.globalCompositeOperation = "source-over";

      const depth = baseY - y;
      if (depth > 0) {
        const ry = baseY + depth * 0.55;
        const rx = x + Math.sin(ry * 0.09 - t * 1.6) * (2 + depth * 0.02);
        ctx.globalAlpha = a * 0.28 * Math.max(0, 1 - depth / maxDepth);
        ctx.fillRect(rx, ry, p.size, p.size * 0.7);
      }
    }

    for (const p of thoughts) {                           // thoughts rising from the crown
      let age = t - p.born;
      if (age > p.life) { spawnThought(p, t); age = 0; }
      p.y += p.vy * dt;
      p.x += (Math.sin(p.y * 0.03 + p.seed + t * 0.3) * 0.4 + (p.x - 200) * 0.003) * dt;
      const life = age / p.life;
      const ty = baseY - (FIG_BOTTOM - p.y) * k;
      const edgeFade = Math.min(1, Math.max(0, (ty - fadeTop) / 60));
      if (edgeFade <= 0) continue;
      ctx.globalAlpha = Math.sin(Math.PI * life) * 0.9 * edgeFade;
      ctx.fillStyle = mix(PALETTE.main, PALETTE.thought, Math.min(1, life * 1.4));
      ctx.fillRect(cx + (p.x - 200) * k, ty, p.size, p.size);
    }

    if (label) {                                          // word swaps while the label is faded out
      const word = ph < 0.5 ? "Inhale" : "Exhale";
      if (label.textContent !== word) label.textContent = word;
      label.style.opacity = (0.6 + 0.4 * Math.abs(Math.sin(ph * Math.PI * 2))).toFixed(2);
    }
  }

  const onMove = (e) => {
    const r = root.getBoundingClientRect();
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
  };
  const onLeave = () => { pointer.x = pointer.y = -9999; };
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerleave", onLeave);

  const still = () => draw(1.5, 1);
  layout();
  const ro = new ResizeObserver(() => { layout(); if (reducedMotion()) still(); });
  ro.observe(root);
  const cleanup = () => {
    ro.disconnect();
    root.removeEventListener("pointermove", onMove);
    root.removeEventListener("pointerleave", onLeave);
  };

  if (reducedMotion()) {
    still();
    if (label) { label.textContent = "Breathe"; label.style.opacity = "1"; }
    return cleanup;
  }
  let raf = 0, t0 = performance.now(), last = t0;
  const frame = (now) => {
    const dt = Math.min((now - last) / 16.67, 3);
    last = now;
    draw((now - t0) / 1000, dt);
    raf = requestAnimationFrame(frame);
  };
  const stopVisible = whileVisible(canvas, () => { last = performance.now(); raf = requestAnimationFrame(frame); }, () => cancelAnimationFrame(raf));
  return () => { stopVisible(); cleanup(); };
}
