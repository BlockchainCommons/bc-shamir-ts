/**
 * Lagrange interpolation over GF(2^8), 32 bytes at a time.
 *
 * @module interpolate
 */
import { memzero } from "@blockchaincommons/crypto";
import { MAX_SECRET_LENGTH } from "./constants.js";
import { bitslice, bitsliceSetall, gf256Add, gf256Inv, gf256Mul, unbitslice } from "./hazmat.js";

const REG = 8;

/**
 * Write the `n` Lagrange basis coefficients l_i(x) for the points `xc[0..n]`
 * into `values[0..n]`. All `n` numerators and denominators are computed in
 * one bitsliced register each (lane i holds point i), so the work is
 * independent of `n` up to 32.
 *
 * `words` provides `(n + 6) * 8` scratch words, `xx` 48 scratch bytes.
 */
function lagrangeBasis(
  values: Uint8Array,
  n: number,
  xc: Uint8Array,
  x: number,
  words: Uint32Array,
  xx: Uint8Array,
): void {
  const xSlice = words.subarray(0, REG);
  const numerator = words.subarray(REG, 2 * REG);
  const denominator = words.subarray(2 * REG, 3 * REG);
  const temp = words.subarray(3 * REG, 4 * REG);
  const invY = words.subarray(4 * REG, 5 * REG);
  const invZ = words.subarray(5 * REG, 6 * REG);
  // Views are created once: a subarray per loop iteration is what made the
  // first cut of this rewrite slower than the allocate-per-call original.
  const lxi: Uint32Array[] = [];
  for (let i = 0; i < n; i++) lxi.push(words.subarray((6 + i) * REG, (7 + i) * REG));
  const lx0 = lxi[0];

  // xx = [ x0 x1 … xn-1 x0 x1 … xn-1 0 … ]; lxi[i] is the rotation starting at i.
  xx.set(xc.subarray(0, n), 0);
  for (let i = 0; i < n; i++) {
    bitslice(lxi[i], xx.subarray(i));
    xx[i + n] = xx[i];
  }

  bitsliceSetall(xSlice, x);
  bitsliceSetall(numerator, 1);
  bitsliceSetall(denominator, 1);

  for (let i = 1; i < n; i++) {
    const lx = lxi[i];
    // numerator_j *= x - x_{j+i}
    temp.set(xSlice);
    gf256Add(temp, lx);
    gf256Mul(numerator, numerator, temp);
    // denominator_j *= x_j - x_{j+i}
    temp.set(lx0);
    gf256Add(temp, lx);
    gf256Mul(denominator, denominator, temp);
  }

  gf256Inv(temp, denominator, invY, invZ);
  gf256Mul(numerator, numerator, temp);

  unbitslice(xx, numerator);
  values.set(xx.subarray(0, n), 0);
}

/**
 * Evaluate at `x` the polynomial of degree `n - 1` through the points
 * `(xi[i], yij[i])`, byte-wise over the first `yl` bytes of each y.
 * Every scratch buffer is zeroed before returning.
 */
export function interpolate(
  n: number,
  xi: Uint8Array,
  yl: number,
  yij: readonly Uint8Array[],
  x: number,
): Uint8Array<ArrayBuffer> {
  // One word arena and one byte arena per call: the basis needs (n + 6)
  // registers, the sum three more; the bytes hold the 32-byte y blocks the
  // bitslicer needs, the 48-byte xx scratch, a 32-byte result block, and
  // the n basis coefficients.
  const words = new Uint32Array((n + 9) * REG);
  const bytes = new Uint8Array(n * MAX_SECRET_LENGTH + 48 + MAX_SECRET_LENGTH + n);
  const basisWords = words.subarray(0, (n + 6) * REG);
  const ySlice = words.subarray((n + 6) * REG, (n + 7) * REG);
  const resultSlice = words.subarray((n + 7) * REG, (n + 8) * REG);
  const temp = words.subarray((n + 8) * REG, (n + 9) * REG);
  const yBlocks: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    yBlocks.push(bytes.subarray(i * MAX_SECRET_LENGTH, (i + 1) * MAX_SECRET_LENGTH));
  }
  const xx = bytes.subarray(n * MAX_SECRET_LENGTH, n * MAX_SECRET_LENGTH + 48);
  const values = bytes.subarray(
    n * MAX_SECRET_LENGTH + 48,
    n * MAX_SECRET_LENGTH + 48 + MAX_SECRET_LENGTH,
  );
  const lagrange = bytes.subarray(n * MAX_SECRET_LENGTH + 48 + MAX_SECRET_LENGTH);

  for (let i = 0; i < n; i++) yBlocks[i].set(yij[i].subarray(0, yl), 0);

  lagrangeBasis(lagrange, n, xi, x, basisWords, xx);

  for (let i = 0; i < n; i++) {
    bitslice(ySlice, yBlocks[i]);
    bitsliceSetall(temp, lagrange[i]);
    gf256Mul(temp, temp, ySlice);
    gf256Add(resultSlice, temp);
  }

  unbitslice(values, resultSlice);
  const result = new Uint8Array(yl);
  result.set(values.subarray(0, yl), 0);

  memzero(words);
  memzero(bytes);
  return result;
}
