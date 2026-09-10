/**
 * Baseline vs working tree micro-benchmarks (Phase 2.3).
 *
 *   bun run build && bun bench/benchmark.mjs
 */
import * as baseline from "../tests/baseline/shamir-baseline.mjs";
import * as current from "../dist/index.mjs";

const secret = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 0xff);
const rng = {
  fillRandomData(d) {
    for (let i = 0; i < d.length; i++) d[i] = (i * 31 + 11) & 0xff;
  },
  fillBytes(d) {
    this.fillRandomData(d);
  },
  nextU32() {
    throw new Error("unused");
  },
  nextU64() {
    throw new Error("unused");
  },
};

function time(fn, iters = 5) {
  fn();
  let best = Infinity;
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

const cases = {
  "split 3-of-5 + recover ×1000": [
    () => {
      for (let i = 0; i < 1000; i++) {
        const s = baseline.splitSecret(3, 5, secret, rng);
        baseline.recoverSecret([0, 2, 4], [s[0], s[2], s[4]]);
      }
    },
    () => {
      for (let i = 0; i < 1000; i++) {
        const s = current.splitSecret(secret, { threshold: 3, shareCount: 5, rng });
        current.recoverSecret([s[0], s[2], s[4]]);
      }
    },
  ],
  "split 16-of-16 + recover ×200": [
    () => {
      for (let i = 0; i < 200; i++) {
        const s = baseline.splitSecret(16, 16, secret, rng);
        baseline.recoverSecret(
          s.map((_, k) => k),
          s,
        );
      }
    },
    () => {
      for (let i = 0; i < 200; i++) {
        const s = current.splitSecret(secret, { threshold: 16, shareCount: 16, rng });
        current.recoverSecret(s);
      }
    },
  ],
  "split 2-of-16 ×1000": [
    () => {
      for (let i = 0; i < 1000; i++) baseline.splitSecret(2, 16, secret, rng);
    },
    () => {
      for (let i = 0; i < 1000; i++)
        current.splitSecret(secret, { threshold: 2, shareCount: 16, rng });
    },
  ],
};

console.log(
  `${"case".padEnd(32)} ${"baseline".padStart(10)} ${"current".padStart(10)} ${"speedup".padStart(8)}`,
);
for (const [name, [b, c]] of Object.entries(cases)) {
  const tb = time(b),
    tc = time(c);
  console.log(
    `${name.padEnd(32)} ${tb.toFixed(1).padStart(8)}ms ${tc.toFixed(1).padStart(8)}ms ${(tb / tc).toFixed(2).padStart(7)}×`,
  );
}
