/**
 * Property tests: any t-subset recovers; any (t-1)-subset does not (checksum
 * failure or a different value); one flipped byte in a t-subset fails the
 * checksum.
 */
import fc from "fast-check";
import * as src from "../src";
import * as rand from "@blockchaincommons/rand";
import { isBytes, isRecord } from "../src/domain";
import { currentAdapterFor, hex } from "./vectors/recipes";

const api = currentAdapterFor(src, rand);
const seed = fc.tuple(
  fc.bigInt({ min: 1n, max: (1n << 64n) - 1n }),
  fc.bigInt({ min: 0n, max: (1n << 64n) - 1n }),
  fc.bigInt({ min: 0n, max: (1n << 64n) - 1n }),
  fc.bigInt({ min: 0n, max: (1n << 64n) - 1n }),
);
const params = fc
  .tuple(fc.integer({ min: 1, max: 16 }), fc.integer({ min: 1, max: 16 }))
  .map(([a, b]) => (a <= b ? [a, b] : [b, a]) as [number, number]);
const secret = fc
  .integer({ min: 8, max: 16 })
  .chain((h) => fc.uint8Array({ minLength: 2 * h, maxLength: 2 * h }));
const rngOf = (s: [bigint, bigint, bigint, bigint]) =>
  api.makeRng({ seed: s.map(String) as [string, string, string, string] });

describe("shamir properties", () => {
  it("any t-subset recovers the secret", () => {
    fc.assert(
      fc.property(params, secret, seed, fc.nat(), ([t, n], s, sd, pick) => {
        const shares = api.split(t, n, s, rngOf(sd));
        const idx = Array.from({ length: n }, (_, i) => i)
          .sort((a, b) => ((a * 7919 + pick) % 97) - ((b * 7919 + pick) % 97))
          .slice(0, t);
        return (
          hex(
            api.recover(
              idx,
              idx.map((i) => shares[i]),
            ),
          ) === hex(s)
        );
      }),
      { numRuns: 150 },
    );
  });
  it("a (t-1)-subset never yields the secret", () => {
    fc.assert(
      fc.property(
        params.filter(([t]) => t >= 2),
        secret,
        seed,
        ([t, n], s, sd) => {
          const shares = api.split(t, n, s, rngOf(sd));
          const idx = Array.from({ length: t - 1 }, (_, i) => i);
          try {
            return (
              hex(
                api.recover(
                  idx,
                  idx.map((i) => shares[i]),
                ),
              ) !== hex(s)
            );
          } catch (e) {
            return api.errorCode(e) === "ChecksumFailure";
          }
        },
      ),
      { numRuns: 100 },
    );
  });
  it("one flipped byte in a t-subset fails the checksum", () => {
    fc.assert(
      fc.property(
        params.filter(([t]) => t >= 2),
        secret,
        seed,
        fc.nat(),
        fc.integer({ min: 1, max: 255 }),
        ([t, n], s, sd, pos, mask) => {
          const shares = api.split(t, n, s, rngOf(sd));
          const idx = Array.from({ length: t }, (_, i) => i);
          const sub = idx.map((i) => new Uint8Array(shares[i]));
          sub[pos % t][(pos >> 4) % s.length] ^= mask;
          try {
            api.recover(idx, sub);
            return false;
          } catch (e) {
            return api.errorCode(e) === "ChecksumFailure";
          }
        },
      ),
      { numRuns: 100 },
    );
  });
  const secret16 = Uint8Array.from({ length: 16 }, (_, i) => i);
  const nonUsize: fc.Arbitrary<number | bigint> = fc.oneof(
    fc.constantFrom<number | bigint>(
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      -1n,
      2n ** 64n,
    ),
    fc.double({ noInteger: true, noNaN: true }),
    fc.integer({ max: -1 }),
    fc.bigInt({ min: 2n ** 64n }),
    fc.bigInt({ max: -1n }),
  );
  const invalidParameter = (f: () => unknown, parameter: string): boolean => {
    try {
      f();
      return false;
    } catch (e) {
      return (
        src.ShamirError.isShamirError(e) &&
        e.is("InvalidParameter") &&
        e.details.code === "InvalidParameter" &&
        e.details.parameter === parameter
      );
    }
  };
  it("any non-integer or out-of-range threshold, shareCount or index throws InvalidParameter", () => {
    fc.assert(
      fc.property(nonUsize, fc.integer({ min: 1, max: 16 }), (v, n) =>
        invalidParameter(
          () => src.splitSecret(secret16, { threshold: v, shareCount: n }),
          "threshold",
        ),
      ),
    );
    fc.assert(
      fc.property(nonUsize, fc.integer({ min: 1, max: 16 }), (v, t) =>
        invalidParameter(
          () => src.splitSecret(secret16, { threshold: t, shareCount: v }),
          "shareCount",
        ),
      ),
    );
    const shares = src.splitSecret(secret16, {
      threshold: 2,
      shareCount: 3,
      rng: rand.SeededRng.forTesting(),
    });
    fc.assert(
      fc.property(nonUsize, (v) =>
        invalidParameter(
          () => src.recoverSecret([{ index: v, data: shares[0].data }, shares[1]]),
          "index",
        ),
      ),
    );
  });
  it("any bigint label in [0, 2^64 - 1] recovers through its low eight bits", () => {
    fc.assert(
      fc.property(secret, seed, fc.bigInt({ min: 0n, max: 2n ** 56n - 1n }), (data, sd, k) => {
        const shares = api.split(3, 5, data, rngOf(sd));
        const base = k * 256n;
        expect(api.recover([base, base + 1n, base + 2n], shares.slice(0, 3))).toEqual(data);
      }),
      { numRuns: 150 },
    );
  });
  it("number and bigint labels agree over the safe range", () => {
    fc.assert(
      fc.property(secret, seed, fc.integer({ min: 0, max: 2 ** 45 - 1 }), (data, sd, k) => {
        const shares = api.split(3, 5, data, rngOf(sd));
        const asNumbers = [k * 256, k * 256 + 1, k * 256 + 2];
        const asBigints = asNumbers.map(BigInt);
        expect(api.recover(asBigints, shares.slice(0, 3))).toEqual(
          api.recover(asNumbers, shares.slice(0, 3)),
        );
      }),
      { numRuns: 100 },
    );
  });
  it("any wrongly typed secret, data, shares or options is InvalidParameter naming it", () => {
    const shares = src.splitSecret(secret16, {
      threshold: 3,
      shareCount: 3,
      rng: rand.SeededRng.forTesting(),
    });
    const notBytes = fc.anything().filter((v) => !isBytes(v));
    const notArray = fc.anything().filter((v) => !Array.isArray(v));
    const notObject = fc.anything().filter((v) => !isRecord(v));
    for (const threshold of [1, 3]) {
      const rng = rand.SeededRng.forTesting();
      fc.assert(
        fc.property(notBytes, (v) =>
          invalidParameter(
            () => src.splitSecret(v as Uint8Array, { threshold, shareCount: 3, rng }),
            "secret",
          ),
        ),
      );
      fc.assert(
        fc.property(notBytes, (v) =>
          invalidParameter(
            () =>
              src.recoverSecret([
                { index: 0, data: v as Uint8Array },
                ...shares.slice(1, threshold),
              ]),
            "data",
          ),
        ),
      );
    }
    fc.assert(
      fc.property(notArray, (v) =>
        invalidParameter(() => src.recoverSecret(v as src.ShamirShareInput[]), "shares"),
      ),
    );
    fc.assert(
      fc.property(notObject, (v) =>
        invalidParameter(() => src.splitSecret(secret16, v as src.SplitOptions), "options"),
      ),
    );
    fc.assert(
      fc.property(notObject, (v) =>
        invalidParameter(
          () => src.recoverSecret([v as src.ShamirShareInput, ...shares.slice(1)]),
          "share",
        ),
      ),
    );
  });
  it("adding multiples of 256 to share labels preserves recovery", () => {
    fc.assert(
      fc.property(secret, seed, fc.integer({ min: 0, max: 2 ** 45 - 1 }), (data, sd, multiple) => {
        const shares = api.split(3, 5, data, rngOf(sd));
        expect(
          api.recover([multiple * 256, multiple * 256 + 1, multiple * 256 + 2], shares.slice(0, 3)),
        ).toEqual(data);
      }),
      { numRuns: 150 },
    );
  });
  it("splitSecret never returns fewer than shareCount shares", () => {
    fc.assert(
      fc.property(
        params,
        secret,
        seed,
        ([t, n], s, sd) => api.split(t, n, s, rngOf(sd)).length === n,
      ),
      { numRuns: 150 },
    );
  });
});
