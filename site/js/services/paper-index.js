// The searchable paper collection: papers in display order plus one normalised vector per paper.
// Vectors come from the first strategy that works:
//   1. precomputed files (fast, needs the same model as the site),
//   2. a copy cached in IndexedDB by an earlier visit,
//   3. embedding every paper on this device (slow, then cached).

import { fetchBin, fetchJSON } from "../core/dom.js";
import { dequantize, hashString, paperText } from "../lib/search-core.js";

export class PaperIndex {
  constructor(papers, source) {
    this.papers = papers;
    this.source = source;
    this.map = null;
    this.vectors = null;
    this.dim = 0;
    this.vectorSource = "";
    this.pos = new Map(papers.map((p, i) => [p.id, i]));
  }

  setVectors(vectors, dim, how) { this.vectors = vectors; this.dim = dim; this.vectorSource = how; }

  static async load({ config, kb, encoder, status = () => {} }) {
    const { papers, source, hasVectors } = await loadPapers(kb);
    const index = new PaperIndex(papers, source);
    if (hasVectors && await fromPrecomputed(index, config)) return index;
    if (await fromCache(index, config)) return index;
    await fromDevice(index, config, encoder, status);
    return index;
  }
}

async function loadPapers(kb) {
  try {
    const corpus = await fetchJSON("data/corpus.json");
    return { papers: corpus.papers, source: `corpus ${corpus.version || ""}`.trim(), hasVectors: Boolean(corpus.embeddings) };
  } catch {
    const papers = kb.papers.map((p) => ({ ...p, curated: true, kb_id: p.id, source: "curated" }));
    return { papers, source: "curated knowledge base", hasVectors: false };
  }
}

async function fromPrecomputed(index, config) {
  try {
    const meta = await fetchJSON("data/embeddings.meta.json");
    if (meta.browser_model !== config.model || meta.count !== index.papers.length) return false;
    const [q, s] = await Promise.all([
      fetchBin("data/embeddings.i8.bin", Int8Array),
      fetchBin("data/embeddings.scale.f32.bin", Float32Array),
    ]);
    index.setVectors(dequantize(q, s, meta.dim), meta.dim, "precomputed");
    try { index.map = await fetchJSON("data/map.json"); } catch { /* computed on demand */ }
    return true;
  } catch {
    return false;
  }
}

const texts = (index) => index.papers.map((p) => paperText(p.title, p.abstract || p.summary));
const cacheKey = (index, config) => `${config.model}:${hashString(texts(index).join("\n"))}`;

async function fromCache(index, config) {
  const cached = await cacheGet(cacheKey(index, config));
  if (!cached) return false;
  index.setVectors(new Float32Array(cached.vectors), cached.dim, "cached on this device");
  return true;
}

async function fromDevice(index, config, encoder, status) {
  status(`Embedding ${index.papers.length} papers on your device…`);
  const { vectors, dim } = await encoder.embed(texts(index));
  cachePut(cacheKey(index, config), { vectors: vectors.buffer.slice(0), dim });
  index.setVectors(vectors, dim, "computed on this device");
}

// ---- IndexedDB cache (best effort: private mode or blocked storage just skips it) ----
const DB = "cn-embeddings", STORE = "vectors";
function idb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function cacheGet(key) {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(undefined);
    });
  } catch { return undefined; }
}
async function cachePut(key, value) {
  try { const db = await idb(); db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key); } catch { /* ignore */ }
}
