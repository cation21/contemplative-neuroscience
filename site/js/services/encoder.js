// Client for the encoder Web Worker. The worker owns the model; this class only sends
// messages, so the page stays responsive while the model loads and runs.

export class Encoder {
  /**
   * @param {{model: string, dtype: string, transformers_js: string}} config
   * @param {(event: object) => void} onProgress  download and batch-embedding progress
   */
  constructor(config, onProgress = () => {}) {
    this.onProgress = onProgress;
    this.worker = new Worker(new URL("../workers/clm-worker.js", import.meta.url), { type: "module" });
    this.pending = new Map();
    this.nextId = 1;
    this.worker.onmessage = ({ data }) => {
      if (data.type === "progress" || data.type === "embed-progress") return this.onProgress(data);
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      data.type === "error" ? p.reject(new Error(data.message)) : p.resolve(data);
    };
    // Paths in config are relative to the site, not to the worker; resolve them here.
    const base = new URL(".", document.baseURI).href;
    this.ready = this.call({
      type: "init",
      config: { ...config, base, transformers_js: new URL(config.transformers_js, base).href },
    });
  }

  call(msg) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...msg, id });
    });
  }

  /** @returns {Promise<{vectors: Float32Array, dim: number}>} row-major, L2-normalised */
  async embed(texts) {
    await this.ready;
    const { vectors, dim } = await this.call({ type: "embed", texts });
    return { vectors, dim };
  }

  /** Word pieces the model actually sees, or null if the runtime cannot tell. */
  async tokenize(text) {
    await this.ready;
    const { tokens } = await this.call({ type: "tokenize", text });
    return tokens;
  }
}
