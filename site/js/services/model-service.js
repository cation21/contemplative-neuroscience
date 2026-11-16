// Loads the encoder and the paper index once, on first need, and reports progress as events.
// Views depend on this service, never on the worker or the loading strategies directly.

import { Encoder } from "./encoder.js";
import { PaperIndex } from "./paper-index.js";

export function createModelService({ config, kb }) {
  const events = new EventTarget();
  let encoder = null, indexPromise = null, encoderInfo = null;
  const emit = (message, fraction = null, state = "loading") =>
    events.dispatchEvent(new CustomEvent("status", { detail: { message, fraction, state } }));

  function getEncoder() {
    if (encoder) return encoder;
    const files = new Map();
    encoder = new Encoder(config, (p) => {
      if (p.type === "progress") {
        files.set(p.file, p);
        const all = [...files.values()];
        const loaded = all.reduce((a, f) => a + f.loaded, 0), total = all.reduce((a, f) => a + f.total, 0);
        emit(`Downloading the model once (${(total / 1e6).toFixed(0)} MB, cached afterwards)…`, loaded / total);
      } else if (p.type === "embed-progress") {
        emit(`Embedding the collection on your device: ${p.done}/${p.total}`, p.done / p.total);
      }
    });
    emit("Loading the model…");
    encoder.ready.then((info) => { encoderInfo = info; }).catch(() => {});
    return encoder;
  }

  function index() {
    if (indexPromise) return indexPromise;
    indexPromise = (async () => {
      const enc = getEncoder();
      const info = await enc.ready;
      const idx = await PaperIndex.load({ config, kb, encoder: enc, status: (m) => emit(m) });
      emit(`Ready · ${idx.papers.length} papers (${idx.source}, vectors ${idx.vectorSource}) · model ${config.model.split("/").pop()} on ${info.device}`, null, "ready");
      return idx;
    })().catch((e) => {
      emit(`Could not load the model: ${e.message}. Check your connection and reload; Explore works offline.`, null, "error");
      indexPromise = null;
      throw e;
    });
    return indexPromise;
  }

  return {
    events,
    encoder: getEncoder,
    index,
    get device() { return encoderInfo?.device; },
    get loaded() { return Boolean(indexPromise); },
  };
}
