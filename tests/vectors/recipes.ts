/**
 * Vector recipes: a recipe names an operation and its inputs; `materialize`
 * runs it through a `VectorApi` and returns one outcome string, so the same
 * recipe drives the golden file, the differential and the Rust harness.
 * Adapters bridge the pre- and post-redesign surfaces.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Bytes = { hex: string } | { cycle: number; start?: number } | { text: string };
/**
 * A JavaScript `number` that must survive JSON: `NaN` and the infinities
 * have no JSON form, so they travel as strings.
 */
export type Num = number | "NaN" | "Infinity" | "-Infinity";
export const num = (v: Num): number => (typeof v === "number" ? v : Number(v));
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
export type Recipe =
  | ({ k: "split" } & SplitSpec)
  | { k: "recover"; shares: { index: Num; data: Bytes }[] }
  | {
      k: "recover";
      from: SplitSpec;
      /** Positions into the split's shares; also their labels unless `labels` is given. */
      indexes: number[];
      /** Index labels handed to recovery in place of `indexes` (JS-only domain rows). */
      labels?: Num[];
      corrupt?: Corruption;
    };
export type Outcome = string;

export interface RngLike {
  fill(dest: Uint8Array): void;
}
export interface VectorApi {
  split(t: number, n: number, secret: Uint8Array, rng: RngLike): Uint8Array[];
  recover(indexes: number[], shares: Uint8Array[]): Uint8Array;
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
    return `split ${r.t}/${r.n} len=${toBytes(r.secret).length} ${rngName(r.rng)}`;
  if ("shares" in r) return `recover [${r.shares.map((s) => s.index).join(",")}] explicit`;
  return `recover ${r.from.t}/${r.from.n} len=${toBytes(r.from.secret).length} ${rngName(r.from.rng)} [${r.indexes.join(",")}]${
    r.labels ? ` labels=[${r.labels.join(",")}]` : ""
  }${r.corrupt ? ` corrupt(${r.corrupt.share},${r.corrupt.byte},${r.corrupt.mask})` : ""}`;
}
const rngName = (r: RngSpec): string => ("fake" in r ? "fake" : `seed=${r.seed[0].slice(0, 6)}`);

export function materialize(api: VectorApi, r: Recipe): Outcome {
  try {
    if (r.k === "split") {
      return api
        .split(num(r.t), num(r.n), toBytes(r.secret), api.makeRng(r.rng))
        .map(hex)
        .join(",");
    }
    let indexes: number[];
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
      shares = r.indexes.map((i) => new Uint8Array(all[i]!));
      if (r.corrupt) shares[r.corrupt.share]![r.corrupt.byte] ^= r.corrupt.mask;
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

/** Pre-redesign surface: `splitSecret(t, n, secret, rng)` over the old rand (`fillRandomData`). */
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

/** Redesigned surface (D1): `splitSecret(secret, { threshold, shareCount, rng })` → `ShamirShare[]`. */
export function redesignedAdapterFor(m: any, rand: any): VectorApi {
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
  if (m.ShamirErrorType !== undefined) {
    // Pre-Phase-3 surface on the redesigned rand.
    return {
      split: (t, n, secret, rng) => m.splitSecret(t, n, secret, wrap(rng)),
      recover: (indexes, shares) => m.recoverSecret(indexes, shares),
      makeRng,
      errorCode: (e) => (e as any)?.type,
    };
  }
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
