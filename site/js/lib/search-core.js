// Pure functions shared by the finder, the map and the tests. No DOM, no network.

/** The exact string embedded for a paper. Mirrors clm/common.py::paper_text. */
export function paperText(title, body) {
  const t = (title || "").split(/\s+/).join(" ").trim();
  const b = (body || "").split(/\s+/).join(" ").trim();
  return b ? `${t}. ${b}` : t;
}

/** Dequantize int8 rows with per-row float32 scales into one Float32Array (row-major). */
export function dequantize(int8, scales, dim) {
  const out = new Float32Array(int8.length);
  for (let r = 0; r < scales.length; r++) {
    const s = scales[r], o = r * dim;
    for (let j = 0; j < dim; j++) out[o + j] = int8[o + j] * s;
  }
  return out;
}

export function normalizeInPlace(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

/** Cosine scores of one normalised query against a row-major matrix of normalised rows. */
export function scoreAll(query, matrix, dim) {
  const n = matrix.length / dim, out = new Float32Array(n);
  for (let r = 0; r < n; r++) {
    let s = 0;
    const o = r * dim;
    for (let j = 0; j < dim; j++) s += query[j] * matrix[o + j];
    out[r] = s;
  }
  return out;
}

/** Indices of the k largest scores, filtered by an optional predicate over the index. */
export function topK(scores, k, keep = () => true) {
  const idx = [];
  for (let i = 0; i < scores.length; i++) if (keep(i)) idx.push(i);
  idx.sort((a, b) => scores[b] - scores[a]);
  return idx.slice(0, k);
}

export function row(matrix, dim, i) {
  return matrix.subarray(i * dim, (i + 1) * dim);
}

/** Mean of rows, normalised. Used to place a query on the map near its neighbours. */
export function weightedPosition(points, weights) {
  let x = 0, y = 0, w = 0;
  points.forEach((p, i) => { const wi = Math.max(weights[i], 0) ** 4; x += p[0] * wi; y += p[1] * wi; w += wi; });
  return w ? [x / w, y / w] : [0.5, 0.5];
}

/** Rebuild plain text from an OpenAlex abstract_inverted_index. */
export function reconstructAbstract(inverted) {
  if (!inverted) return "";
  const words = [];
  for (const [w, positions] of Object.entries(inverted)) for (const p of positions) words[p] = w;
  return words.filter(Boolean).join(" ");
}

const STOP = new Set(`a about above after again against all also am an and any are as at be because been before
being below between both but by can could did do does doing down during each few for from further had has
have having he her here hers herself him himself his how i if in into is it its itself just me more most my
myself no nor not now of off on once only or other our ours ourselves out over own same she should so some
such than that the their theirs them themselves then there these they this those through to too under until
up very was we were what when where which while who whom why will with you your yours yourself yourselves
study studies studied result results show shows showed shown suggest suggests suggested find found finding
findings using use used based effect effects associated association compared significant significantly
participants paper present research approach data analysis method methods new may might however whether
within across among toward towards via well within increased decreased higher lower greater two three one
evidence role investigate investigated examine examined examining propose proposed aim aims here thus`.split(/\s+/));

/** Simple keyword extraction for the optional live search. Returns at most n distinct terms. */
export function extractKeywords(text, n = 8) {
  const tokens = (text || "").toLowerCase().match(/[a-z][a-z0-9\-]{2,}/g) || [];
  const counts = new Map();
  tokens.forEach((t, i) => {
    if (STOP.has(t)) return;
    counts.set(t, (counts.get(t) || 0) + 1 + 1 / (i + 10)); // slight preference for early terms
  });
  // Repeated bigrams of content words (e.g. "mind wandering", "default mode") outrank their parts.
  const bigrams = new Map();
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i], b = tokens[i + 1];
    if (STOP.has(a) || STOP.has(b)) continue;
    bigrams.set(`${a} ${b}`, (bigrams.get(`${a} ${b}`) || 0) + 1);
  }
  for (const [bg, n] of bigrams) if (n >= 2) counts.set(bg, n * 2.5);
  const ranked = [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([t]) => t);
  const out = [];
  for (const t of ranked) {
    if (out.length >= n) break;
    if (out.some((o) => o.includes(t) || t.includes(o))) continue;
    out.push(t);
  }
  return out;
}

/** Europe PMC query: papers must match at least two of the keywords in title/abstract. */
export function europePmcQuery(keywords) {
  const terms = keywords.map((k) => `TITLE_ABS:"${k.replace(/"/g, "")}"`);
  if (terms.length <= 2) return terms.join(" AND ");
  const [first, ...rest] = terms;
  return `${first} AND (${rest.join(" OR ")})`;
}

/** Case-insensitive search across all string fields; every query word must appear somewhere. */
export function matchesQuery(item, q) {
  if (!q) return true;
  const hay = JSON.stringify(item).toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/** First two principal components via power iteration. Rows must be normalised. */
export function pca2(matrix, dim, iters = 60) {
  const n = matrix.length / dim, mean = new Float32Array(dim);
  for (let r = 0; r < n; r++) for (let j = 0; j < dim; j++) mean[j] += matrix[r * dim + j] / n;
  const centered = new Float32Array(matrix.length);
  for (let r = 0; r < n; r++) for (let j = 0; j < dim; j++) centered[r * dim + j] = matrix[r * dim + j] - mean[j];
  const comps = [];
  for (let c = 0; c < 2; c++) {
    let v = new Float32Array(dim).map((_, j) => Math.sin(j * (c + 1) + 1));
    for (let it = 0; it < iters; it++) {
      const proj = scoreAll(v, centered, dim), next = new Float32Array(dim);
      for (let r = 0; r < n; r++) for (let j = 0; j < dim; j++) next[j] += proj[r] * centered[r * dim + j];
      for (const p of comps) { let d = 0; for (let j = 0; j < dim; j++) d += next[j] * p[j]; for (let j = 0; j < dim; j++) next[j] -= d * p[j]; }
      v = normalizeInPlace(next);
    }
    comps.push(v);
  }
  const xs = scoreAll(comps[0], centered, dim), ys = scoreAll(comps[1], centered, dim);
  return rescale(Array.from(xs, (x, i) => [x, ys[i]]));
}

function rescale(points) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return points.map(([x, y]) => [(x - x0) / (x1 - x0 || 1), (y - y0) / (y1 - y0 || 1)]);
}

/** Cosine k-means on normalised rows. Deterministic seeding (evenly spaced rows). */
export function kmeans(matrix, dim, k, iters = 30) {
  const n = matrix.length / dim;
  k = Math.max(1, Math.min(k, n));
  let centers = Array.from({ length: k }, (_, c) => Float32Array.from(row(matrix, dim, Math.floor((c * n) / k))));
  let labels = new Int32Array(n);
  for (let it = 0; it < iters; it++) {
    for (let r = 0; r < n; r++) {
      let best = 0, bs = -Infinity;
      const v = row(matrix, dim, r);
      centers.forEach((c, ci) => { let s = 0; for (let j = 0; j < dim; j++) s += v[j] * c[j]; if (s > bs) { bs = s; best = ci; } });
      labels[r] = best;
    }
    centers = centers.map((c, ci) => {
      const m = new Float32Array(dim); let cnt = 0;
      for (let r = 0; r < n; r++) if (labels[r] === ci) { cnt++; const v = row(matrix, dim, r); for (let j = 0; j < dim; j++) m[j] += v[j]; }
      return cnt ? normalizeInPlace(m) : c;
    });
  }
  return labels;
}

/** Label clusters with distinctive title words. */
export function labelClusters(titles, labels, k) {
  const docs = titles.map((t) => new Set(((t || "").toLowerCase().match(/[a-z][a-z\-]{2,}/g) || [])
    .filter((w) => !STOP.has(w) && !["meditation", "mindfulness", "meditators", "meditative", "brain", "neural", "practice", "training"].includes(w))));
  const df = new Map();
  docs.forEach((d) => d.forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
  return Array.from({ length: k }, (_, c) => {
    const tf = new Map();
    docs.forEach((d, i) => { if (labels[i] === c) d.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1)); });
    return [...tf.entries()].sort((a, b) => b[1] * Math.log(titles.length / df.get(b[0])) - a[1] * Math.log(titles.length / df.get(a[0])))
      .slice(0, 3).map(([w]) => w).join(", ") || `group ${c + 1}`;
  });
}

/** Minimal BibTeX for export. */
export function toBibtex(p) {
  const first = (p.authors || "anon").split(/[ ,]/)[0].toLowerCase().replace(/[^a-z]/g, "") || "anon";
  const key = `${first}${p.year || ""}${(p.title || "").toLowerCase().match(/[a-z]{4,}/)?.[0] || ""}`;
  const f = [["title", `{${p.title}}`], ["author", p.authors], ["year", p.year], ["journal", p.venue], ["doi", p.doi], ["url", p.link]]
    .filter(([, v]) => v).map(([k, v]) => `  ${k} = {${v}}`);  // title keeps double braces to preserve case
  return `@article{${key},\n${f.join(",\n")}\n}`;
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
