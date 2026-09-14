/**
 * Deterministic differential corpus: every (threshold, shareCount) pair
 * with 1 ≤ t ≤ n ≤ 16, every even secret length in [16, 32], four seeds;
 * recovery from subsets (up to size 5) of a 2-of-5 and a 3-of-7 split, with
 * bit-flip corruptions; every invalid-parameter combination in validator
 * order; the JS-only and bigint integer domains; consecutive splits from
 * one generator. Pure and deterministic.
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
    if (Number(num(from.n)) === 16) {
      // 2^16 subsets is too many; singles, every 15-subset, and the full set.
      const all = Array.from({ length: 16 }, (_, i) => i);
      for (const i of all) yield { k: "recover", from, indexes: [i] };
      for (const i of all) yield { k: "recover", from, indexes: all.filter((j) => j !== i) };
      yield { k: "recover", from, indexes: all };
    } else {
      for (const indexes of subsets(Number(num(from.n)), 5)) yield { k: "recover", from, indexes };
    }
    // corruptions of a valid threshold subset
    const idx = Array.from({ length: Number(num(from.t)) }, (_, i) => i);
    for (const byte of [0, 1, 3, 4, 7, 15]) {
      for (const mask of [0x01, 0x80]) {
        yield { k: "recover", from, indexes: idx, corrupt: { share: 0, byte, mask } };
        yield {
          k: "recover",
          from,
          indexes: idx,
          corrupt: { share: Number(num(from.t)) - 1, byte, mask },
        };
      }
    }
  }
  // Labels 254 and 255 name the digest and secret points: the checksum rejects them.
  const labelled: SplitSpec = { t: 3, n: 5, secret: cyc(16, 1), rng: SEEDS[0] };
  for (const labels of [
    [254, 1, 2],
    [255, 1, 2],
    [0, 1, 254],
    [0, 1, 255],
  ])
    yield { k: "recover", from: labelled, indexes: [0, 1, 2], labels };
  // Share 0 of a 2-of-3 split paired with the secret itself at the secret's
  // label (255; 511 narrows to it) recovers; at 254 the secret is not the digest.
  for (const index of [255, 511, 254])
    yield {
      k: "recover",
      shares: [
        { index: 0, data: { hex: "f0187fe4a2c25ccce353ff82c42b0356" } },
        { index, data: cyc(16, 1) },
      ],
    };
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
  // A number past the safe range is rejected: a double there stands for
  // several integers. The reference accepts the integer it denotes.
  yield { k: "split", t: 1, n: 2 ** 53, secret, rng };
  yield { k: "split", t: 2 ** 53, n: 1, secret, rng };
  yield { k: "recover", from, indexes: [0, 1, 2], labels: [2 ** 53, 1, 2] };
  yield { k: "recover", from, indexes: [0, 1, 2], labels: [2 ** 64, 1, 2] };
  yield { k: "recover", from: { t: 1, n: 3, secret, rng }, indexes: [0], labels: [2 ** 53] };
  yield { k: "recover", from: { t: 1, n: 3, secret, rng }, indexes: [0], labels: [2 ** 64] };
}

/**
 * The bigint form of `threshold`, `shareCount` and `index`: exact over the
 * whole 64-bit `usize` domain. Split compares in bigint, recovery narrows to
 * eight bits as the reference's `as u8` does. Negative bigints and those at
 * or above 2^64 are rejected.
 */
function* wide(): Generator<Recipe> {
  const rng = SEEDS[0];
  const secret = cyc(16, 1);
  const params: [Num, Num][] = [
    ["1n", "9007199254740992n"],
    ["9007199254740992n", "1n"],
    ["18446744073709551615n", "16n"],
    ["1n", "18446744073709551615n"],
    ["3n", "5n"],
    [3, "5n"],
    ["1n", "18446744073709551616n"],
    ["-1n", 3],
  ];
  for (const [t, n] of params) yield { k: "split", t, n, secret, rng };
  const from: SplitSpec = { t: 3, n: 5, secret, rng };
  const labels: Num[][] = [
    ["9007199254740992n", 1, 2],
    ["9007199254740993n", 1, 2],
    ["9007199254740994n", 1, 2],
    ["18446744073709551615n", 1, 2],
    ["18446744073709551360n", 1, 2],
    ["256n", "1n", "2n"],
    ["18446744073709551616n", 1, 2],
    ["-1n", 1, 2],
  ];
  for (const l of labels) yield { k: "recover", from, indexes: [0, 1, 2], labels: l };
  const single: SplitSpec = { t: 1, n: 3, secret, rng };
  yield { k: "recover", from: single, indexes: [0], labels: ["18446744073709551615n"] };
  yield { k: "recover", from: single, indexes: [0], labels: ["9007199254740992n"] };
  // Share 0 of a 2-of-3 split whose second point is the secret itself, at
  // the label 2^53 + 255 (255 as u8).
  yield {
    k: "recover",
    shares: [
      { index: 0, data: { hex: "f0187fe4a2c25ccce353ff82c42b0356" } },
      { index: "9007199254741247n", data: secret },
    ],
  };
}

/** Two splits from one generator: the second's shares pin how much the first drew. */
function* sequences(): Generator<Recipe> {
  const rng = SEEDS[0];
  const then = (t: number, n: number, secret: Bytes) => ({ t, n, secret });
  yield { k: "split", t: 3, n: 5, secret: cyc(16, 0x20), rng, then: then(2, 3, cyc(18, 0x30)) };
  yield { k: "split", t: 16, n: 16, secret: cyc(32, 0x20), rng, then: then(3, 5, cyc(16, 0x30)) };
  yield { k: "split", t: 1, n: 4, secret: cyc(20, 0x20), rng, then: then(2, 3, cyc(16, 0x30)) };
}

export const categories: Record<string, () => Generator<Recipe>> = {
  splits,
  recovers,
  invalid,
  domain,
  wide,
  sequences,
};
/**
 * Categories the frozen baseline cannot run: a bigint input makes it throw
 * `TypeError` before any Shamir logic, so the differential skips them and
 * only the Rust harness pins their outcomes.
 */
export const NO_BASELINE: Record<string, number> = { wide: 19 };
export function* allRecipes(): Generator<Recipe> {
  for (const g of Object.values(categories)) yield* g();
}
/** Golden subset: one seed over every pair at lengths 16 and 32, all fake-rng splits, and every other category whole. */
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
  yield* wide();
  yield* sequences();
}
