/**
 * Deterministic differential corpus: every (threshold, shareCount) pair
 * with 1 ≤ t ≤ n ≤ 16, every even secret length in [16, 32], four seeds;
 * recovery from subsets (up to size 5) of a 2-of-5 and a 3-of-7 split, with
 * bit-flip corruptions; every invalid-parameter combination in validator
 * order. Pure and deterministic.
 */
import {
  num,
  type Recipe,
  type RngSpec,
  type SplitSpec,
  type Bytes,
  type Num,
} from "../vectors/recipes";

const cyc = (n: number, start = 0): Bytes => ({ cycle: n, start });
export const SEEDS: RngSpec[] = [
  {
    seed: [
      "17295166580085024720",
      "422929670265678780",
      "5577237070365765850",
      "7953171132032326923",
    ],
  },
  { seed: ["1", "1", "1", "1"] },
  { seed: ["81985529216486895", "18364758544493064720", "3735928559", "14627333968358932480"] },
  { seed: ["0", "0", "0", "1"] },
];
export const FAKE: RngSpec = { fake: true };
export const LENGTHS: number[] = [16, 18, 20, 22, 24, 26, 28, 30, 32];

function* pairs(): Generator<[number, number]> {
  for (let n = 1; n <= 16; n++) for (let t = 1; t <= n; t++) yield [t, n];
}
function* subsets(n: number, max: number): Generator<number[]> {
  const total = 1 << n;
  for (let m = 1; m < total; m++) {
    const s: number[] = [];
    for (let i = 0; i < n; i++) if (m & (1 << i)) s.push(i);
    if (s.length <= max) yield s;
  }
}

function* splits(): Generator<Recipe> {
  for (const [t, n] of pairs())
    for (const len of LENGTHS)
      for (const [si, rng] of SEEDS.entries())
        yield { k: "split", t, n, secret: cyc(len, 0x20 + si), rng };
  for (const [t, n] of [
    [3, 5],
    [2, 7],
    [1, 5],
    [2, 3],
    [16, 16],
    [2, 16],
  ] as const)
    for (const len of [16, 24, 32]) yield { k: "split", t, n, secret: cyc(len, 7), rng: FAKE };
}
function* recovers(): Generator<Recipe> {
  const bases: SplitSpec[] = [
    { t: 2, n: 5, secret: cyc(16, 0x30), rng: SEEDS[0] },
    { t: 3, n: 7, secret: cyc(32, 0x40), rng: SEEDS[1] },
    { t: 1, n: 3, secret: cyc(18, 0x50), rng: SEEDS[2] },
    { t: 16, n: 16, secret: cyc(20, 0x60), rng: SEEDS[3] },
  ];
  for (const from of bases) {
    if (num(from.n) === 16) {
      // 2^16 subsets is too many; singles, every 15-subset, and the full set.
      const all = Array.from({ length: 16 }, (_, i) => i);
      for (const i of all) yield { k: "recover", from, indexes: [i] };
      for (const i of all) yield { k: "recover", from, indexes: all.filter((j) => j !== i) };
      yield { k: "recover", from, indexes: all };
    } else {
      for (const indexes of subsets(num(from.n), 5)) yield { k: "recover", from, indexes };
    }
    // corruptions of a valid threshold subset
    const idx = Array.from({ length: num(from.t) }, (_, i) => i);
    for (const byte of [0, 1, 3, 4, 7, 15]) {
      for (const mask of [0x01, 0x80]) {
        yield { k: "recover", from, indexes: idx, corrupt: { share: 0, byte, mask } };
        yield { k: "recover", from, indexes: idx, corrupt: { share: num(from.t) - 1, byte, mask } };
      }
    }
  }
  // explicit-share cases (validation)
  yield { k: "recover", shares: [] };
  yield {
    k: "recover",
    shares: [
      { index: 0, data: cyc(16) },
      { index: 1, data: cyc(24) },
    ],
  };
  yield {
    k: "recover",
    shares: [
      { index: 0, data: cyc(15) },
      { index: 1, data: cyc(15) },
    ],
  };
  yield {
    k: "recover",
    shares: [
      { index: 0, data: cyc(17) },
      { index: 1, data: cyc(17) },
    ],
  };
  yield {
    k: "recover",
    shares: [
      { index: 0, data: cyc(34) },
      { index: 1, data: cyc(34) },
    ],
  };
  yield {
    k: "recover",
    shares: Array.from({ length: 17 }, (_, i) => ({ index: i, data: cyc(16, i) })),
  };
  yield { k: "recover", shares: [{ index: 5, data: cyc(16, 9) }] };
  yield {
    k: "recover",
    shares: [
      { index: 0, data: cyc(16) },
      { index: 0, data: cyc(16) },
    ],
  };
  yield {
    k: "recover",
    shares: [
      { index: 0, data: cyc(16) },
      { index: 1, data: cyc(16, 1) },
    ],
  };
}
function* invalid(): Generator<Recipe> {
  const rng = SEEDS[0];
  for (const [t, n, len] of [
    [2, 17, 16], // TooManyShares
    [0, 3, 16], // InvalidThreshold
    [4, 3, 16], // InvalidThreshold
    [2, 17, 8], // TooManyShares before SecretTooShort
    [5, 3, 64], // InvalidThreshold before SecretTooLong
    [2, 3, 34], // SecretTooLong
    [2, 3, 33], // SecretTooLong before odd
    [2, 3, 8], // SecretTooShort
    [2, 3, 15], // SecretTooShort before odd
    [2, 3, 17], // SecretNotEvenLen
    [2, 3, 0],
    [1, 1, 16],
    [1, 16, 32],
  ] as const)
    yield { k: "split", t, n, secret: cyc(len), rng };
}

/** Integer-domain rejection and Rust-compatible oversized index labels. */
function* domain(): Generator<Recipe> {
  const rng = SEEDS[0];
  const secret = cyc(16, 1);
  const params: [Num, Num][] = [
    [1, "NaN"],
    ["NaN", 3],
    [1.5, 3],
    [2, 2.5],
    [0.5, 3],
    [2, "Infinity"],
    [2, -1],
    [-1, 3],
  ];
  for (const [t, n] of params) yield { k: "split", t, n, secret, rng };
  const from: SplitSpec = { t: 3, n: 5, secret, rng };
  for (const label of [256, 65536, -1, 1.5, "NaN"] as Num[])
    yield { k: "recover", from, indexes: [0, 1, 2], labels: [label, 1, 2] };
  // Single-share recovery ignores supported index labels.
  yield { k: "recover", from: { t: 1, n: 3, secret, rng }, indexes: [0], labels: [300] };
}

export const categories: Record<string, () => Generator<Recipe>> = {
  splits,
  recovers,
  invalid,
  domain,
};
export function* allRecipes(): Generator<Recipe> {
  for (const g of Object.values(categories)) yield* g();
}
/** Golden subset: one seed over every pair at lengths 16 and 32, all fake-rng splits, every recover and invalid case. */
export function* goldenRecipes(): Generator<Recipe> {
  for (const r of splits()) {
    if (r.k !== "split") continue;
    const len = (r.secret as { cycle: number }).cycle;
    if (
      "fake" in r.rng ||
      (r.rng === SEEDS[0] && (len === 16 || len === 32)) ||
      (r.rng === SEEDS[1] && len === 30)
    )
      yield r;
  }
  yield* recovers();
  yield* invalid();
  yield* domain();
}
