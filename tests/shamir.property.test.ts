/**
 * Property tests (Phase 0.3): any t-subset recovers; any (t-1)-subset does
 * not (checksum failure or a different value); one flipped byte in a
 * t-subset fails the checksum.
 */
import fc from "fast-check";
import * as src from "../src";
import * as rand from "@blockchaincommons/rand";
import { redesignedAdapterFor, hex } from "./vectors/recipes";

const api = redesignedAdapterFor(src, rand);
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
              idx.map((i) => shares[i]!),
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
                  idx.map((i) => shares[i]!),
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
          const sub = idx.map((i) => new Uint8Array(shares[i]!));
          sub[pos % t]![(pos >> 4) % s.length] ^= mask;
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
});
