// "How it works": an interactive explanation of the contrastive language model (CLM).
//   1. the real encoder turns your text into tokens and a 384-number vector,
//   2. cosine similarity on the unit circle (drag the vectors),
//   3. a live InfoNCE training simulation in 2D,
//   4. what was trained in this project (from data/clm.json).
// The maths lives in lib/infonce.js and is unit-tested; this file only draws and wires controls.

import { $, esc, fetchJSON } from "../core/dom.js";
import { batchAccuracy, infonce, randomUnit2, rng, sphereStep } from "../lib/infonce.js";
import { scoreAll, topK } from "../lib/search-core.js";

let ctx;

export function mount(c) {
  ctx = c;
  mountEncoderDemo();
  mountCosine();
  mountTraining();
  mountProject();
}

// ------------------------------------------------------------------ 1. text -> tokens -> vector
const approxTokens = (t) => ["[CLS]", ...(t.toLowerCase().match(/[a-z]+|\d+|[^\s\w]/g) || []).slice(0, 254), "[SEP]"];

function mountEncoderDemo() {
  const status = $("#how-status");
  ctx.models.events.addEventListener("status", ({ detail }) => {
    if (detail.state !== "ready") status.textContent = detail.message;
  });
  $("#how-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("#how-text").value.trim();
    if (!text) return;
    const btn = $("#how-run");
    btn.disabled = true; btn.textContent = "Running…";
    try {
      const enc = ctx.models.encoder();
      status.textContent = "Loading the model (once, then cached)…";
      const [tokens, { vectors }] = await Promise.all([enc.tokenize(text).catch(() => null), enc.embed([text])]);
      renderTokens(tokens || approxTokens(text), !tokens);
      renderVector(vectors);
      status.textContent = `Encoded on your device (${ctx.models.device || "wasm"}). Finding the nearest papers…`;
      const index = await ctx.models.index();
      const scores = scoreAll(vectors, index.vectors, index.dim);
      const top = topK(scores, 5);
      $("#how-near").innerHTML = `<p class="kicker">Nearest of ${index.papers.length} papers by cosine</p><ol>${top.map((i) => `<li>
          <span class="cos">${scores[i].toFixed(3)}</span>
          <button class="link" data-action="detail" data-ref="${esc(ctx.ui.ref(index.papers[i]))}">${esc(index.papers[i].title)}</button></li>`).join("")}</ol>`;
      status.textContent = "Done. Change the text and run it again to see the vector move.";
    } catch (err) {
      status.textContent = `The model could not run here: ${err.message}`;
    } finally {
      btn.disabled = false; btn.textContent = "Run the encoder";
    }
  });
}

function renderTokens(tokens, approx) {
  $("#how-tokens").innerHTML = tokens.map((t) => `<span class="tok${/^\[|^##/.test(t) ? " sub" : ""}">${esc(t)}</span>`).join("")
    + `<p class="small muted">${tokens.length} tokens${approx ? " (approximate split; the model's WordPiece splits rare words further)" : ". Pieces starting with ## continue the previous word."}</p>`;
}

function renderVector(v) {
  let max = 0, norm = 0;
  for (const x of v) { max = Math.max(max, Math.abs(x)); norm += x * x; }
  $("#how-vector").innerHTML = Array.from(v, (x, i) => {
    const pct = Math.round((Math.abs(x) / max) * 100);
    return `<i title="dimension ${i + 1}: ${x.toFixed(4)}" style="background:color-mix(in oklab, var(${x >= 0 ? "--pos" : "--neg"}) ${pct}%, var(--surface-2))"></i>`;
  }).join("");
  $("#how-vector-stats").innerHTML = `384 numbers · largest |value| ${max.toFixed(3)} · length ‖e‖ = ${Math.sqrt(norm).toFixed(3)}
    <span class="legend-inline"><i style="background:var(--neg)"></i>negative <i style="background:var(--pos)"></i>positive</span>`;
}

// ------------------------------------------------------------------ 2. cosine on the unit circle
function mountCosine() {
  const svg = $("#cos-svg"), R = 110, C = 140;
  const angles = { a: 20, b: 75 };
  const pt = (deg) => [C + R * Math.cos((deg * Math.PI) / 180), C - R * Math.sin((deg * Math.PI) / 180)];
  const render = () => {
    const [ax, ay] = pt(angles.a), [bx, by] = pt(angles.b);
    const va = [Math.cos(angles.a * Math.PI / 180), Math.sin(angles.a * Math.PI / 180)];
    const vb = [Math.cos(angles.b * Math.PI / 180), Math.sin(angles.b * Math.PI / 180)];
    const cos = va[0] * vb[0] + va[1] * vb[1];
    let theta = Math.abs(angles.a - angles.b) % 360; if (theta > 180) theta = 360 - theta;
    for (const [k, x, y] of [["a", ax, ay], ["b", bx, by]]) {
      $(`#cos-line-${k}`, svg).setAttribute("x2", x); $(`#cos-line-${k}`, svg).setAttribute("y2", y);
      const h = $(`#cos-h-${k}`, svg);
      h.setAttribute("cx", x); h.setAttribute("cy", y);
      h.setAttribute("aria-valuenow", String(Math.round(angles[k])));
      h.setAttribute("aria-valuetext", `${Math.round(angles[k])} degrees`);
    }
    $("#cos-read").innerHTML = `
      <div><dt>angle θ</dt><dd>${theta.toFixed(0)}°</dd></div>
      <div><dt>cos θ = a · b</dt><dd class="big">${cos.toFixed(3)}</dd></div>
      <p class="calc">(${va[0].toFixed(2)} × ${vb[0].toFixed(2)}) + (${va[1].toFixed(2)} × ${vb[1].toFixed(2)}) = ${cos.toFixed(3)}</p>
      <p class="small muted">${cos > 0.8 ? "Pointing the same way: very related." : cos > 0.3 ? "Somewhat related." : cos > -0.3 ? "About unrelated (near 90°)." : "Pointing apart: opposite meaning, rare for real text."}</p>`;
  };
  let drag = null;
  const angleAt = (e) => {
    const r = svg.getBoundingClientRect(), s = 280 / r.width;
    return (Math.atan2(-((e.clientY - r.top) * s - C), (e.clientX - r.left) * s - C) * 180) / Math.PI;
  };
  for (const k of ["a", "b"]) {
    const h = $(`#cos-h-${k}`, svg);
    h.addEventListener("pointerdown", (e) => { drag = k; h.setPointerCapture(e.pointerId); });
    h.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 15 : 5;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") angles[k] += step;
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") angles[k] -= step;
      else return;
      e.preventDefault(); render();
    });
  }
  svg.addEventListener("pointermove", (e) => { if (drag) { angles[drag] = angleAt(e); render(); } });
  svg.addEventListener("pointerup", () => (drag = null));
  render();
}

// ------------------------------------------------------------------ 3. InfoNCE training in 2D
function mountTraining() {
  const st = { B: 5, scale: 20, lr: 0.004, seed: 1, A: [], P: [], step: 0, hist: [], playing: false, raf: 0 };
  const hue = (i) => `hsl(${(270 + (i * 360) / st.B) % 360} 80% 66%)`;

  function reset() {
    const r = rng(st.seed);
    st.A = Array.from({ length: st.B }, () => randomUnit2(r));
    st.P = Array.from({ length: st.B }, () => randomUnit2(r));
    st.step = 0; st.hist = [];
    render();
  }
  function step(n = 1) {
    for (let k = 0; k < n; k++) {
      const g = infonce(st.A, st.P, st.scale);
      st.hist.push(g.loss);
      st.A = sphereStep(st.A, g.gradA, st.lr);
      st.P = sphereStep(st.P, g.gradP, st.lr);
      st.step++;
    }
    render();
  }
  function render() {
    const { S, P, loss } = infonce(st.A, st.P, st.scale);
    // circle
    const R = 120, C = 150, xy = (v) => [C + R * v[0], C - R * v[1]];
    $("#nce-pairs").innerHTML = st.A.map((a, i) => {
      const [x1, y1] = xy(a), [x2, y2] = xy(st.P[i]), c = hue(i);
      return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="1.5" stroke-dasharray="3 3" opacity=".8"/>
        <circle cx="${x1}" cy="${y1}" r="7" fill="${c}"><title>anchor a${i + 1}</title></circle>
        <circle cx="${x2}" cy="${y2}" r="7" fill="none" stroke="${c}" stroke-width="2.5"><title>positive p${i + 1}</title></circle>
        <text x="${C + (R + 20) * a[0]}" y="${C - (R + 20) * a[1] + 4}" text-anchor="middle" class="svg-label">a${i + 1}</text></g>`;
    }).join("");
    // matrix of probabilities
    const head = `<span></span>${st.P.map((_, j) => `<span class="mh" style="color:${hue(j)}">p${j + 1}</span>`).join("")}`;
    const rows = P.map((rowP, i) => `<span class="mh" style="color:${hue(i)}">a${i + 1}</span>${rowP.map((v, j) =>
      `<span class="mc${i === j ? " diag" : ""}" style="--v:${v.toFixed(3)}" title="S = ${S[i][j].toFixed(2)}, P = ${v.toFixed(3)}">${v.toFixed(2)}</span>`).join("")}`).join("");
    const m = $("#nce-matrix");
    m.style.gridTemplateColumns = `auto repeat(${st.B}, minmax(0, 1fr))`;
    m.innerHTML = head + rows;
    // live formula for row 1
    $("#nce-row1").innerHTML = `Row a1: S<sub>11</sub> = ${S[0][0].toFixed(2)}, P<sub>11</sub> = e<sup>S11</sup> / Σ<sub>j</sub> e<sup>S1j</sup> = ${P[0][0].toFixed(3)}, so its share of the loss is −log P<sub>11</sub> = ${(-Math.log(Math.max(P[0][0], 1e-12))).toFixed(3)}`;
    // readouts and loss curve
    $("#nce-loss").textContent = loss.toFixed(3);
    $("#nce-acc").textContent = `${Math.round(batchAccuracy(P) * 100)}%`;
    $("#nce-step").textContent = st.step;
    $("#nce-chance").textContent = Math.log(st.B).toFixed(2);
    const h = st.hist.length ? st.hist : [loss], hi = Math.max(...h, Math.log(st.B)), W = 300, Hh = 70;
    $("#nce-curve").setAttribute("points", h.map((v, i) => `${(i / Math.max(h.length - 1, 1)) * W},${Hh - (v / hi) * (Hh - 6) - 3}`).join(" "));
  }
  function loop() {
    step(1);
    const done = st.hist.at(-1) < 0.01 || st.step > 3000;
    if (done) return toggle(false);
    st.raf = requestAnimationFrame(loop);
  }
  function toggle(on = !st.playing) {
    st.playing = on;
    $("#nce-play").textContent = on ? "Pause" : "Train";
    $("#nce-play").setAttribute("aria-pressed", String(on));
    cancelAnimationFrame(st.raf);
    if (on) st.raf = requestAnimationFrame(loop);
  }
  $("#nce-play").addEventListener("click", () => toggle());
  $("#nce-step-btn").addEventListener("click", () => { toggle(false); step(10); });
  $("#nce-reset").addEventListener("click", () => { toggle(false); st.seed++; reset(); });
  const scale = $("#nce-scale"), bsize = $("#nce-b");
  scale.addEventListener("input", () => { st.scale = Number(scale.value); $("#nce-scale-out").textContent = scale.value; render(); });
  bsize.addEventListener("input", () => { toggle(false); st.B = Number(bsize.value); $("#nce-b-out").textContent = bsize.value; reset(); });
  ctx.stopTraining = () => toggle(false);
  reset();
}

export function hide() { ctx?.stopTraining?.(); }

// ------------------------------------------------------------------ 4. what this project trained
async function mountProject() {
  let d;
  try { d = await fetchJSON("data/clm.json"); } catch { $("#how-project").innerHTML = `<p class="muted">Training details are not available in this build.</p>`; return; }
  const t = d.training;
  $("#how-facts").innerHTML = [
    ["Base model", t.base_model], ["Training papers", t.train_papers.toLocaleString()], ["Held-out papers", t.test_papers.toLocaleString()],
    ["Pairs", `${t.pairs.toLocaleString()} (${Object.entries(t.pair_kinds).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(", ")})`],
    ["Loss", t.loss], ["Epochs · batch · lr", `${t.epochs} · ${t.batch} · ${t.lr}`], ["Hardware", t.hardware], ["Training time", `${t.runtime_s} s`],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
  const order = Object.keys(d.results);
  const tasks = Object.keys(d.results[order[0]]);
  $("#how-results").innerHTML = tasks.map((task) => `<div class="rgroup"><p class="kicker">${esc(task.replace("->", " → "))} · recall@1</p>${order.map((m) => {
    const v = d.results[m][task]["recall@1"], ft = m === d.finetuned;
    return `<div class="rrow${ft ? " ft" : ""}"><span class="rname">${esc(d.labels?.[m] || m)}</span><span class="rbar"><span style="width:${(v * 100).toFixed(1)}%"></span></span><span class="rval">${v.toFixed(3)}</span></div>`;
  }).join("")}</div>`).join("");
  $("#how-caveats").innerHTML = (d.caveats || []).map((c) => `<li>${esc(c)}</li>`).join("");
}
