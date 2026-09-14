/**
 * Vector recipes: a recipe names an operation and its inputs; `materialize`
 * runs it through a `VectorApi` and returns one outcome string, so the same
 * recipe drives the golden file, the differential and the Rust harness.
 * Adapters bridge the frozen baseline surface and the current one.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Bytes = { hex: string } | { cycle: number; start?: number } | { text: string };
/**
 * A recipe integer. `NaN` and the infinities have no JSON form, so they
 * travel as strings; a `bigint` travels as its decimal digits followed by
 * `n`, which JSON keeps exact where a `number` above `2^53 - 1` would not be.
 */
export type Num = number | "NaN" | "Infinity" | "-Infinity" | `${bigint}n`;
export const num = (v: Num): number | bigint => {
  if (typeof v === "number") return v;
  if (v.endsWith("n")) return BigInt(v.slice(0, -1));
  return Number(v);
};
/** Seeded xoshiro state (four decimal u64 strings) or the counter "fake" generator (0, 17, 34, …). */
export type RngSpec = { seed: [string, string, string, string] } | { fake: true };
export interface SplitSpec {
  t: Num;
  n: Num;
  secret: Bytes;
  rng: RngSpec;
}
export interface Corruption {
  /** Position in the `indexes` list, not the share index. */
  share: number;
  byte: number;
  mask: number;
}
/** A second split drawn from the same generator after the first; its shares follow a `;`. */
export interface SplitThen {
  t: Num;
  n: Num;
  secret: Bytes;
}
export type Recipe =
  | ({ k: "split"; then?: SplitThen } & SplitSpec)
  | { k: "recover"; shares: { index: Num; data: Bytes }[] }
  | {
      k: "recover";
      from: SplitSpec;
      /** Positions into the split's shares; also their labels unless `labels` is given. */
      indexes: number[];
      /** Index labels handed to recovery in place of `indexes` (narrowing and domain checks). */
      labels?: Num[];
      corrupt?: Corruption;
    };
export type Outcome = string;

export interface RngLike {
  fill(dest: Uint8Array): void;
}
export interface VectorApi {
  split(t: number | bigint, n: number | bigint, secret: Uint8Array, rng: RngLike): Uint8Array[];
  recover(indexes: (number | bigint)[], shares: Uint8Array[]): Uint8Array;
  makeRng(spec: RngSpec): RngLike;
  /** The error's code/type, or undefined for a non-package error. */
  errorCode(e: unknown): string | undefined;
}

export function toBytes(b: Bytes): Uint8Array {
  if ("hex" in b) return Uint8Array.from(Buffer.from(b.hex, "hex"));
  if ("text" in b) return new TextEncoder().encode(b.text);
  const start = b.start ?? 0;
  return Uint8Array.from({ length: b.cycle }, (_, i) => (start + i) & 0xff);
}
export const hex = (u: Uint8Array): string => Buffer.from(u).toString("hex");

export function recipeName(r: Recipe): string {
  if (r.k === "split")
    return `split ${r.t}/${r.n} len=${toBytes(r.secret).length} ${rngName(r.rng)}${
      r.then ? ` then ${r.then.t}/${r.then.n} len=${toBytes(r.then.secret).length}` : ""
    }`;
  if ("shares" in r) return `recover [${r.shares.map((s) => s.index).join(",")}] explicit`;
  return `recover ${r.from.t}/${r.from.n} len=${toBytes(r.from.secret).length} ${rngName(r.from.rng)} [${r.indexes.join(",")}]${
    r.labels ? ` labels=[${r.labels.join(",")}]` : ""
  }${r.corrupt ? ` corrupt(${r.corrupt.share},${r.corrupt.byte},${r.corrupt.mask})` : ""}`;
}
const rngName = (r: RngSpec): string => ("fake" in r ? "fake" : `seed=${r.seed[0].slice(0, 6)}`);

export function materialize(api: VectorApi, r: Recipe): Outcome {
  try {
    if (r.k === "split") {
      const rng = api.makeRng(r.rng);
      const shares = (t: Num, n: Num, secret: Bytes): string =>
        api.split(num(t), num(n), toBytes(secret), rng).map(hex).join(",");
      const first = shares(r.t, r.n, r.secret);
      return r.then ? `${first};${shares(r.then.t, r.then.n, r.then.secret)}` : first;
    }
    let indexes: (number | bigint)[];
    let shares: Uint8Array[];
    if ("shares" in r) {
      indexes = r.shares.map((s) => num(s.index));
      shares = r.shares.map((s) => toBytes(s.data));
    } else {
      const all = api.split(
        num(r.from.t),
        num(r.from.n),
        toBytes(r.from.secret),
        api.makeRng(r.from.rng),
      );
      indexes = r.labels ? r.labels.map(num) : r.indexes;
      shares = r.indexes.map((i) => new Uint8Array(all[i]));
      if (r.corrupt) shares[r.corrupt.share][r.corrupt.byte] ^= r.corrupt.mask;
    }
    return hex(api.recover(indexes, shares));
  } catch (e) {
    return `throw:${api.errorCode(e) ?? (e as Error).name}`;
  }
}

const FAKE: RngLike = {
  fill(dest) {
    let b = 0;
    for (let i = 0; i < dest.length; i++) {
      dest[i] = b;
      b = (b + 17) & 0xff;
    }
  },
};

/** The frozen baseline surface: `splitSecret(t, n, secret, rng)` over the baseline rand (`fillRandomData`). */
export function baselineAdapterFor(m: any, randBaseline: any): VectorApi {
  const wrap = (rng: RngLike) => ({
    fillRandomData: (d: Uint8Array) => rng.fill(d),
    fillBytes: (d: Uint8Array) => rng.fill(d),
    randomData: (n: number) => {
      const d = new Uint8Array(n);
      rng.fill(d);
      return d;
    },
    nextU32: () => {
      throw new Error("unused");
    },
    nextU64: () => {
      throw new Error("unused");
    },
  });
  return {
    split: (t, n, secret, rng) => m.splitSecret(t, n, secret, wrap(rng)),
    recover: (indexes, shares) => m.recoverSecret(indexes, shares),
    makeRng: (spec) => {
      if ("fake" in spec) return FAKE;
      const g = new randBaseline.SeededRandomNumberGenerator(spec.seed.map(BigInt));
      return { fill: (d) => g.fillRandomData(d) };
    },
    errorCode: (e) => (e as any)?.type,
  };
}

/** The current surface: `splitSecret(secret, { threshold, shareCount, rng })` → `ShamirShare[]`. */
export function currentAdapterFor(m: any, rand: any): VectorApi {
  const makeRng = (spec: RngSpec): RngLike => {
    if ("fake" in spec) return FAKE;
    const g = new rand.SeededRng(spec.seed.map(BigInt));
    return { fill: (d) => g.fillBytes(d) };
  };
  const wrap = (rng: RngLike) => ({
    fillBytes: (d: Uint8Array) => rng.fill(d),
    nextU32: () => {
      throw new Error("unused");
    },
    nextU64: () => {
      throw new Error("unused");
    },
  });
  return {
    split: (t, n, secret, rng) =>
      m
        .splitSecret(secret, { threshold: t, shareCount: n, rng: wrap(rng) })
        .map((s: any) => s.data),
    recover: (indexes, shares) =>
      m.recoverSecret(shares.map((data, i) => ({ index: indexes[i], data }))),
    makeRng,
    errorCode: (e) => (e as any)?.code,
  };
}
