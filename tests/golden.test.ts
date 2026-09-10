/**
 * Golden snapshots (Phase 0.2): seeded splits for every (threshold,
 * shareCount) at four lengths, recovery from every t-subset for a sample,
 * and the error code for every invalid parameter combination.
 */
import * as src from "../src";
import * as rand from "@blockchaincommons/rand";
import { materialize, redesignedAdapterFor, toBytes, hex, type Recipe } from "./vectors/recipes";
import { SEEDS } from "./corpus/corpus";

const api = redesignedAdapterFor(src, rand);
const run = (r: Recipe) => materialize(api, r);

describe("golden: splits", () => {
  for (let n = 1; n <= 16; n++) {
    it(`all thresholds for shareCount ${n}`, () => {
      const out: string[] = [];
      for (let t = 1; t <= n; t++)
        for (const len of [16, 18, 30, 32])
          out.push(
            `${t}/${n}/${len}: ${run({ k: "split", t, n, secret: { cycle: len, start: 1 }, rng: SEEDS[0]! })}`,
          );
      expect(out).toMatchSnapshot();
    });
  }
});

describe("golden: recovery", () => {
  it("every 3-subset of a 3-of-6 split recovers the secret", () => {
    const secret = toBytes({ cycle: 24, start: 0x11 });
    const shares = api.split(3, 6, secret, api.makeRng(SEEDS[1]!));
    for (let a = 0; a < 6; a++)
      for (let b = a + 1; b < 6; b++)
        for (let c = b + 1; c < 6; c++) {
          expect(hex(api.recover([a, b, c], [shares[a]!, shares[b]!, shares[c]!]))).toBe(
            hex(secret),
          );
        }
  });
  it("error codes in validator order", () => {
    const rng = SEEDS[0]!;
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
