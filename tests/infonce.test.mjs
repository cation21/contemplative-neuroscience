import test from "node:test";
import assert from "node:assert/strict";
import { infonce, sphereStep, batchAccuracy, normalize, rng, randomUnit2 } from "../site/js/lib/infonce.js";

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

test("perfectly aligned, well separated pairs give near-zero loss", () => {
  const A = [[1, 0], [0, 1], [-1, 0]];
  const { loss, P } = infonce(A, A, 20);
  assert.ok(loss < 1e-6);
  assert.equal(batchAccuracy(P), 1);
});

test("identical positives give loss log(B)", () => {
  const A = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const same = A.map(() => [1, 0]);
  close(infonce(A, same, 5).loss, Math.log(4));
});

test("analytic gradient matches finite differences", () => {
  const r = rng(7);
  const A = Array.from({ length: 4 }, () => normalize([r() - 0.5, r() - 0.5, r() - 0.5]));
  const P = Array.from({ length: 4 }, () => normalize([r() - 0.5, r() - 0.5, r() - 0.5]));
  const { gradA, gradP } = infonce(A, P, 10);
  const h = 1e-6;
  for (const [vecs, grad, which] of [[A, gradA, "a"], [P, gradP, "p"]]) {
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) {
      const plus = vecs.map((v) => v.slice()), minus = vecs.map((v) => v.slice());
      plus[i][k] += h; minus[i][k] -= h;
      const lp = which === "a" ? infonce(plus, P, 10).loss : infonce(A, plus, 10).loss;
      const lm = which === "a" ? infonce(minus, P, 10).loss : infonce(A, minus, 10).loss;
      close(grad[i][k], (lp - lm) / (2 * h), 1e-5);
    }
  }
});

test("gradient steps on the sphere lower the loss and keep unit length", () => {
  const r = rng(3);
  let A = Array.from({ length: 6 }, () => randomUnit2(r));
  let P = Array.from({ length: 6 }, () => randomUnit2(r));
  const start = infonce(A, P, 20).loss;
  for (let t = 0; t < 200; t++) {
    const g = infonce(A, P, 20);
    A = sphereStep(A, g.gradA, 0.05); P = sphereStep(P, g.gradP, 0.05);
  }
  assert.ok(infonce(A, P, 20).loss < start / 4);
  for (const v of [...A, ...P]) close(Math.hypot(...v), 1);
});
