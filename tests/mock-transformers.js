// Test double for Transformers.js: deterministic hashed bag-of-words embeddings (384-d).
export const env = {};
function embedOne(text) {
  const v = new Float32Array(384);
  for (const w of (text.toLowerCase().match(/[a-z]{3,}/g) || [])) {
    let h = 2166136261; for (let i = 0; i < w.length; i++) { h ^= w.charCodeAt(i); h = Math.imul(h, 16777619); }
    v[(h >>> 0) % 384] += 1;
  }
  let n = Math.hypot(...v) || 1; return v.map((x) => x / n);
}
export async function pipeline(task, model, opts) {
  if (opts?.progress_callback) opts.progress_callback({ status: "progress", file: "onnx/model_quantized.onnx", loaded: 23e6, total: 23e6 });
  return async (texts) => {
    const arr = Array.isArray(texts) ? texts : [texts];
    const data = new Float32Array(arr.length * 384);
    arr.forEach((t, i) => data.set(embedOne(t), i * 384));
    return { dims: [arr.length, 384], data };
  };
}
