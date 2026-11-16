// InfoNCE (MultipleNegativesRankingLoss) on small sets of vectors. Pure functions, no DOM.
// Used by the "How it works" simulator and tested in tests/infonce.test.mjs.
//
//   S_ij = s · (a_i · p_j)          a_i, p_j unit vectors, s = scale (inverse temperature)
//   P_ij = softmax_j(S_ij)
//   L    = −(1/B) Σ_i log P_ii
//   ∂L/∂S_ij = (P_ij − δ_ij) / B

export const dot = (u, v) => u.reduce((s, x, k) => s + x * v[k], 0);

export function normalize(v) {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

function softmaxRow(row) {
  const m = Math.max(...row);
  const e = row.map((x) => Math.exp(x - m));
  const z = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / z);
}

/** Loss, score matrix, row probabilities and gradients w.r.t. every anchor and positive. */
export function infonce(anchors, positives, scale = 20) {
  const B = anchors.length;
  const S = anchors.map((a) => positives.map((p) => scale * dot(a, p)));
  const P = S.map(softmaxRow);
  const loss = -P.reduce((s, row, i) => s + Math.log(Math.max(row[i], 1e-12)), 0) / B;
  const dS = P.map((row, i) => row.map((pij, j) => (pij - (i === j ? 1 : 0)) / B));
  const dim = anchors[0].length;
  const zero = () => new Array(dim).fill(0);
  const gradA = anchors.map(zero), gradP = positives.map(zero);
  for (let i = 0; i < B; i++) {
    for (let j = 0; j < B; j++) {
      const g = dS[i][j] * scale;
      for (let k = 0; k < dim; k++) {
        gradA[i][k] += g * positives[j][k];
        gradP[j][k] += g * anchors[i][k];
      }
    }
  }
  return { S, P, loss, gradA, gradP };
}

/** One gradient step that keeps vectors on the unit sphere: drop the radial part, step, renormalise. */
export function sphereStep(vectors, grads, lr) {
  return vectors.map((v, i) => {
    const g = grads[i], radial = dot(g, v);
    return normalize(v.map((x, k) => x - lr * (g[k] - radial * x)));
  });
}

/** Accuracy of the in-batch retrieval task: share of anchors whose best positive is their own. */
export function batchAccuracy(P) {
  return P.filter((row, i) => row.indexOf(Math.max(...row)) === i).length / P.length;
}

/** Deterministic pseudo-random generator (mulberry32) so the demo starts the same way for everyone. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomUnit2(rand) {
  const t = rand() * Math.PI * 2;
  return [Math.cos(t), Math.sin(t)];
}
