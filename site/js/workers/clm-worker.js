// Runs the contrastive encoder off the main thread. Text never leaves this worker.
let extractor = null;

async function init({ model, dtype, transformers_js, base }) {
  const { pipeline, env } = await import(transformers_js);
  const local = model.startsWith("./") || model.startsWith("/");
  env.allowLocalModels = local;
  if (local) {
    // Transformers.js joins localModelPath + model id, so the id loses its "./" prefix.
    // localModelPath must be a root-relative path ("/repo/"), not a full URL: in 4.3.x the
    // tokenizer-file existence check skips local lookup for http(s) URLs, the tokenizer is then
    // never loaded, and every embed fails with "this.tokenizer is not a function".
    env.localModelPath = new URL(base).pathname;
    env.allowRemoteModels = false;
    model = model.replace(/^\.?\//, "");
  }
  const progress = (p) => {
    if (p.status === "progress" && p.total) postMessage({ type: "progress", file: p.file, loaded: p.loaded, total: p.total });
  };
  // A failed WebGPU start leaves onnxruntime unable to fall back, so only try WebGPU when an
  // adapter really exists. Then WASM int8, then WASM fp32 as the last resort.
  let gpuOk = false;
  try { gpuOk = Boolean(await self.navigator?.gpu?.requestAdapter()); } catch { gpuOk = false; }
  const attempts = [...(gpuOk ? [{ device: "webgpu", dtype }] : []), { device: "wasm", dtype }, { device: "wasm", dtype: "fp32" }];
  let lastError;
  for (const opts of attempts) {
    try {
      extractor = await pipeline("feature-extraction", model, { ...opts, progress_callback: progress });
      return opts;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

async function embed(texts, batch = 16) {
  let out = null, offset = 0, dim = 384;
  for (let i = 0; i < texts.length; i += batch) {
    const t = await extractor(texts.slice(i, i + batch), { pooling: "mean", normalize: true });
    dim = t.dims[t.dims.length - 1];
    if (!out) out = new Float32Array(texts.length * dim);
    out.set(t.data, offset);
    offset += t.data.length;
    if (texts.length > batch) postMessage({ type: "embed-progress", done: Math.min(i + batch, texts.length), total: texts.length });
  }
  return { vectors: out || new Float32Array(0), dim };
}

function tokenize(text) {
  const tok = extractor?.tokenizer;
  if (!tok) return null;
  try {
    const ids = tok.encode(text);
    const pieces = tok.model?.convert_ids_to_tokens ? tok.model.convert_ids_to_tokens(ids) : ids.map((id) => tok.decode([id]));
    return pieces.slice(0, 256);
  } catch {
    return null;
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      postMessage({ type: "ready", id: data.id, ...(await init(data.config)) });
    } else if (data.type === "embed") {
      const { vectors, dim } = await embed(data.texts);
      postMessage({ type: "result", id: data.id, vectors, dim }, [vectors.buffer]);
    } else if (data.type === "tokenize") {
      postMessage({ type: "result", id: data.id, tokens: tokenize(data.text) });
    }
  } catch (e) {
    postMessage({ type: "error", id: data.id, message: String(e?.message || e) });
  }
};
