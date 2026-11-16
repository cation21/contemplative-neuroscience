import test from "node:test";
import assert from "node:assert/strict";
import * as core from "../site/js/lib/search-core.js";

test("paperText matches the Python format", () => {
  assert.equal(core.paperText("  A  title ", " body\n text "), "A title. body text");
  assert.equal(core.paperText("Only title", ""), "Only title");
});

test("dequantize restores scaled rows", () => {
  const q = new Int8Array([127, 0, -127, 64]), s = new Float32Array([0.5, 0.25]);
  assert.deepEqual(Array.from(core.dequantize(q, s, 2)), [63.5, 0, -31.75, 16]);
});

test("scoreAll + topK rank by cosine and honour the filter", () => {
  const m = new Float32Array([1, 0, 0, 1, Math.SQRT1_2, Math.SQRT1_2]);
  const s = core.scoreAll(new Float32Array([1, 0]), m, 2);
  assert.deepEqual(core.topK(s, 3), [0, 2, 1]);
  assert.deepEqual(core.topK(s, 3, (i) => i !== 0), [2, 1]);
});

test("reconstructAbstract orders words by position", () => {
  assert.equal(core.reconstructAbstract({ world: [1], hello: [0], again: [2] }), "hello world again");
  assert.equal(core.reconstructAbstract(null), "");
});

test("extractKeywords drops stopwords and keeps content bigrams", () => {
  const kw = core.extractKeywords("Mind wandering during breath meditation: we examined mind wandering and frontal theta in EEG", 5);
  assert.ok(kw.includes("mind wandering"), kw.join("|"));
  assert.ok(!kw.includes("we") && !kw.includes("during"));
});

test("europePmcQuery requires the first term plus any other", () => {
  assert.equal(core.europePmcQuery(["eeg", "gamma"]), 'TITLE_ABS:"eeg" AND TITLE_ABS:"gamma"');
  assert.equal(core.europePmcQuery(["a1", "b2", "c3"]), 'TITLE_ABS:"a1" AND (TITLE_ABS:"b2" OR TITLE_ABS:"c3")');
});

test("pca2 and kmeans separate two obvious groups", () => {
  const dim = 3, rows = [[1, 0, 0], [0.99, 0.1, 0], [0, 0, 1], [0, 0.1, 0.99]];
  const m = new Float32Array(rows.flat().map((v, i) => v));
  for (let r = 0; r < 4; r++) core.normalizeInPlace(m.subarray(r * dim, r * dim + dim));
  const pts = core.pca2(m, dim);
  assert.equal(pts.length, 4);
  pts.flat().forEach((v) => assert.ok(v >= 0 && v <= 1));
  const lab = core.kmeans(m, dim, 2);
  assert.equal(lab[0], lab[1]); assert.equal(lab[2], lab[3]); assert.notEqual(lab[0], lab[2]);
});

test("toBibtex builds a usable entry", () => {
  const b = core.toBibtex({ title: "Long-term meditators", authors: "Lutz A, et al.", year: 2004, venue: "PNAS", doi: "10.1/x" });
  assert.match(b, /^@article\{lutz2004long,/);
  assert.match(b, /title = \{\{Long-term meditators\}\}/);
});

test("matchesQuery requires every word", () => {
  assert.ok(core.matchesQuery({ a: "Gamma synchrony", b: ["EEG"] }, "gamma eeg"));
  assert.ok(!core.matchesQuery({ a: "Gamma" }, "gamma fmri"));
});
