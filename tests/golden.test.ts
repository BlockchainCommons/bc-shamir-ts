/**
 * Golden snapshots: seeded splits for every (threshold, shareCount) at four
 * lengths, recovery from every t-subset for a sample, the error code for
 * every invalid parameter combination, and the JS-only input domain.
 */
import * as src from "../src";
import * as rand from "@blockchaincommons/rand";
import { materialize, currentAdapterFor, toBytes, hex, type Recipe } from "./vectors/recipes";
import { SEEDS } from "./corpus/corpus";

const api = currentAdapterFor(src, rand);
const run = (r: Recipe) => materialize(api, r);

describe("golden: splits", () => {
  for (let n = 1; n <= 16; n++) {
    it(`all thresholds for shareCount ${n}`, () => {
      const out: string[] = [];
      for (let t = 1; t <= n; t++)
        for (const len of [16, 18, 30, 32])
          out.push(
            `${t}/${n}/${len}: ${run({ k: "split", t, n, secret: { cycle: len, start: 1 }, rng: SEEDS[0] })}`,
          );
      expect(out).toMatchSnapshot();
    });
  }
});

describe("golden: recovery", () => {
  it("every 3-subset of a 3-of-6 split recovers the secret", () => {
    const secret = toBytes({ cycle: 24, start: 0x11 });
    const shares = api.split(3, 6, secret, api.makeRng(SEEDS[1]));
    for (let a = 0; a < 6; a++)
      for (let b = a + 1; b < 6; b++)
        for (let c = b + 1; c < 6; c++) {
          expect(hex(api.recover([a, b, c], [shares[a], shares[b], shares[c]]))).toBe(hex(secret));
        }
  });
  it("error codes in validator order", () => {
    const rng = SEEDS[0];
    const cases: [number, number, number][] = [
      [2, 17, 16],
      [0, 3, 16],
      [4, 3, 16],
      [2, 17, 8],
      [5, 3, 64],
      [2, 3, 34],
      [2, 3, 33],
      [2, 3, 8],
      [2, 3, 15],
      [2, 3, 17],
    ];
    expect(
      cases.map(
        ([t, n, len]) =>
          `${t}/${n}/${len}: ${run({ k: "split", t, n, secret: { cycle: len }, rng })}`,
      ),
    ).toMatchSnapshot();
    expect([
      run({ k: "recover", shares: [] }),
      run({
        k: "recover",
        shares: [
          { index: 0, data: { cycle: 16 } },
          { index: 1, data: { cycle: 24 } },
        ],
      }),
      run({
        k: "recover",
        shares: [
          { index: 0, data: { cycle: 15 } },
          { index: 1, data: { cycle: 15 } },
        ],
      }),
      run({
        k: "recover",
        from: { t: 2, n: 3, secret: { cycle: 16 }, rng },
        indexes: [0, 1],
        corrupt: { share: 0, byte: 0, mask: 1 },
      }),
    ]).toMatchSnapshot();
  });
});

/**
 * The JS-only input domain: a `threshold`, `shareCount` or index that is not
 * a usize (a safe-integer number or a bigint in [0, 2^64 - 1]) is rejected.
 * A usize label above 255 narrows like Rust's `as u8`: 256 becomes 0.
 */
describe("golden: JS-only input domain", () => {
  const secret = toBytes({ cycle: 16, start: 1 });
  const rng = () => rand.SeededRng.forTesting();
  const outcome = (f: () => unknown): string => {
    try {
      const r = f();
      if (r instanceof Uint8Array) return `recovered:${hex(r)}`;
      if (Array.isArray(r)) return `${r.length} shares`;
      return String(r);
    } catch (e) {
      return `throw:${api.errorCode(e) ?? (e as Error).constructor.name}`;
    }
  };

  it("non-integer threshold and shareCount", () => {
    const split = (threshold: number, shareCount: number) =>
      outcome(() => src.splitSecret(secret, { threshold, shareCount, rng: rng() }));
    expect([
      `threshold 1, shareCount NaN: ${split(1, NaN)}`,
      `threshold NaN, shareCount 3: ${split(NaN, 3)}`,
      `threshold 1.5, shareCount 3: ${split(1.5, 3)}`,
      `threshold 2, shareCount 2.5: ${split(2, 2.5)}`,
      `threshold 0.5, shareCount 3: ${split(0.5, 3)}`,
      `threshold 2, shareCount Infinity: ${split(2, Infinity)}`,
      `threshold 2, shareCount -1: ${split(2, -1)}`,
    ]).toMatchSnapshot();
  });

  it("share indexes outside the eight-bit domain", () => {
    const s = src.splitSecret(secret, { threshold: 3, shareCount: 5, rng: rng() });
    const withIndex = (index: number | bigint) =>
      outcome(() => src.recoverSecret([{ index, data: s[0].data }, s[1], s[2]]));
    expect([
      `index 256 on share 0: ${withIndex(256)}`,
      `index 256n on share 0: ${withIndex(256n)}`,
      `index 2^64 - 1 on share 0: ${withIndex(2n ** 64n - 1n)}`,
      `index 2^53 on share 0: ${withIndex(2 ** 53)}`,
      `index -1 on share 0: ${withIndex(-1)}`,
      `index 1.5 on share 0: ${withIndex(1.5)}`,
      `index NaN on share 0: ${withIndex(NaN)}`,
      `index 254 on share 0: ${withIndex(254)}`,
      `duplicate index 0: ${outcome(() => src.recoverSecret([s[0], s[0], s[2]]))}`,
    ]).toMatchSnapshot();
  });

  it("share objects are frozen", () => {
    const s = src.splitSecret(secret, { threshold: 2, shareCount: 3, rng: rng() });
    const one = src.splitSecret(secret, { threshold: 1, shareCount: 2, rng: rng() });
    expect([
      `threshold 2 share frozen: ${Object.isFrozen(s[0])}`,
      `threshold 1 share frozen: ${Object.isFrozen(one[0])}`,
      `share data is a fresh buffer: ${s[0].data.buffer !== secret.buffer}`,
    ]).toMatchSnapshot();
  });
});
