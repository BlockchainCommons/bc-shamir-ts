/**
 * Bitsliced GF(2^8) arithmetic: 32 field elements are processed at once by
 * holding bit `k` of each element in word `k` of an 8-word register. Every
 * function takes fixed-size registers and validates that; the guards are
 * programming-error checks, not input validation.
 *
 * Overlap rules: `gf256Mul(r, a, b)` may alias `r` with `a` but never with
 * `b` (`b` is read throughout while `r` is written); `gf256Square(r, x)`
 * and `gf256Inv(r, x)` may alias `r` with `x`.
 *
 * @internal
 * @module hazmat
 */
import { memzero } from "@blockchaincommons/crypto";

function requireRegister(name: string, ...regs: Uint32Array[]): void {
  for (const r of regs) {
    if (r.length !== 8) throw new RangeError(`${name}: registers must have 8 elements`);
  }
}

/** Pack 32 bytes into a register. `x` must be at least 32 bytes. */
export function bitslice(r: Uint32Array, x: Uint8Array): void {
  if (x.length < 32) throw new RangeError("bitslice: input must be at least 32 bytes");
  requireRegister("bitslice", r);
  memzero(r);
  for (let arrIdx = 0; arrIdx < 32; arrIdx++) {
    const cur = x[arrIdx];
    for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
      r[bitIdx] |= ((cur & (1 << bitIdx)) >>> bitIdx) << arrIdx;
    }
  }
}

/** Unpack a register into the first 32 bytes of `r`. */
export function unbitslice(r: Uint8Array, x: Uint32Array): void {
  if (r.length < 32) throw new RangeError("unbitslice: output must be at least 32 bytes");
  requireRegister("unbitslice", x);
  memzero(r.subarray(0, 32));
  for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
    const cur = x[bitIdx];
    for (let arrIdx = 0; arrIdx < 32; arrIdx++) {
      r[arrIdx] |= ((cur & (1 << arrIdx)) >>> arrIdx) << bitIdx;
    }
  }
}

/** Broadcast one byte to all 32 lanes. */
export function bitsliceSetall(r: Uint32Array, x: number): void {
  requireRegister("bitsliceSetall", r);
  for (let idx = 0; idx < 8; idx++) {
    r[idx] = ((x >>> idx) & 1) === 1 ? 0xffffffff : 0;
  }
}

/** r += x (XOR in GF(2^8)). */
export function gf256Add(r: Uint32Array, x: Uint32Array): void {
  requireRegister("gf256Add", r, x);
  for (let i = 0; i < 8; i++) r[i] ^= x[i];
}

/**
 * r = a × b modulo x^8 + x^4 + x^3 + x + 1. Schoolbook: for each bit of `b`,
 * add the running `a` shifted, reducing `a` by the polynomial as it shifts.
 * `a` is held in locals, so `r` may alias `a`; it must not alias `b`.
 */
export function gf256Mul(r: Uint32Array, a: Uint32Array, b: Uint32Array): void {
  requireRegister("gf256Mul", r, a, b);
  let a0 = a[0];
  let a1 = a[1];
  let a2 = a[2];
  let a3 = a[3];
  let a4 = a[4];
  let a5 = a[5];
  let a6 = a[6];
  let a7 = a[7];
  const b0 = b[0];
  const b1 = b[1];
  const b2 = b[2];
  const b3 = b[3];
  const b4 = b[4];
  const b5 = b[5];
  const b6 = b[6];
  const b7 = b[7];

  let r0 = a0 & b0;
  let r1 = a1 & b0;
  let r2 = a2 & b0;
  let r3 = a3 & b0;
  let r4 = a4 & b0;
  let r5 = a5 & b0;
  let r6 = a6 & b0;
  let r7 = a7 & b0;
  a0 ^= a7;
  a2 ^= a7;
  a3 ^= a7;

  r0 ^= a7 & b1;
  r1 ^= a0 & b1;
  r2 ^= a1 & b1;
  r3 ^= a2 & b1;
  r4 ^= a3 & b1;
  r5 ^= a4 & b1;
  r6 ^= a5 & b1;
  r7 ^= a6 & b1;
  a7 ^= a6;
  a1 ^= a6;
  a2 ^= a6;

  r0 ^= a6 & b2;
  r1 ^= a7 & b2;
  r2 ^= a0 & b2;
  r3 ^= a1 & b2;
  r4 ^= a2 & b2;
  r5 ^= a3 & b2;
  r6 ^= a4 & b2;
  r7 ^= a5 & b2;
  a6 ^= a5;
  a0 ^= a5;
  a1 ^= a5;

  r0 ^= a5 & b3;
  r1 ^= a6 & b3;
  r2 ^= a7 & b3;
  r3 ^= a0 & b3;
  r4 ^= a1 & b3;
  r5 ^= a2 & b3;
  r6 ^= a3 & b3;
  r7 ^= a4 & b3;
  a5 ^= a4;
  a7 ^= a4;
  a0 ^= a4;

  r0 ^= a4 & b4;
  r1 ^= a5 & b4;
  r2 ^= a6 & b4;
  r3 ^= a7 & b4;
  r4 ^= a0 & b4;
  r5 ^= a1 & b4;
  r6 ^= a2 & b4;
  r7 ^= a3 & b4;
  a4 ^= a3;
  a6 ^= a3;
  a7 ^= a3;

  r0 ^= a3 & b5;
  r1 ^= a4 & b5;
  r2 ^= a5 & b5;
  r3 ^= a6 & b5;
  r4 ^= a7 & b5;
  r5 ^= a0 & b5;
  r6 ^= a1 & b5;
  r7 ^= a2 & b5;
  a3 ^= a2;
  a5 ^= a2;
  a6 ^= a2;

  r0 ^= a2 & b6;
  r1 ^= a3 & b6;
  r2 ^= a4 & b6;
  r3 ^= a5 & b6;
  r4 ^= a6 & b6;
  r5 ^= a7 & b6;
  r6 ^= a0 & b6;
  r7 ^= a1 & b6;
  a2 ^= a1;
  a4 ^= a1;
  a5 ^= a1;

  r0 ^= a1 & b7;
  r1 ^= a2 & b7;
  r2 ^= a3 & b7;
  r3 ^= a4 & b7;
  r4 ^= a5 & b7;
  r5 ^= a6 & b7;
  r6 ^= a7 & b7;
  r7 ^= a0 & b7;

  r[0] = r0;
  r[1] = r1;
  r[2] = r2;
  r[3] = r3;
  r[4] = r4;
  r[5] = r5;
  r[6] = r6;
  r[7] = r7;
}

/** r = x². `r` may alias `x`. */
export function gf256Square(r: Uint32Array, x: Uint32Array): void {
  requireRegister("gf256Square", r, x);
  const x0 = x[0];
  const x1 = x[1];
  const x2 = x[2];
  const x3 = x[3];
  let r8 = x[4];
  let r10 = x[5];
  const r12 = x[6];
  const r14 = x[7];

  let r0 = x0;
  let r2 = x1;
  let r4 = x2;
  let r6 = x3;
  let r7 = r14;
  r6 ^= r14;
  r10 ^= r14;
  r4 ^= r12;
  let r5 = r12;
  r7 ^= r12;
  r8 ^= r12;
  r2 ^= r10;
  let r3 = r10;
  r5 ^= r10;
  r6 ^= r10;
  let r1 = r14;
  r2 ^= r14;
  r4 ^= r14;
  r5 ^= r14;
  r0 ^= r8;
  r1 ^= r8;
  r3 ^= r8;
  r4 ^= r8;

  r[0] = r0;
  r[1] = r1;
  r[2] = r2;
  r[3] = r3;
  r[4] = r4;
  r[5] = r5;
  r[6] = r6;
  r[7] = r7;
}

/**
 * r = x⁻¹ as x^254 by square-and-multiply; zero lanes stay zero. `y` and
 * `z` are caller-provided scratch registers (both are zeroed on return).
 * `r` may alias `x`.
 */
export function gf256Inv(r: Uint32Array, x: Uint32Array, y: Uint32Array, z: Uint32Array): void {
  requireRegister("gf256Inv", r, x, y, z);
  gf256Square(y, x); // y = x^2
  gf256Square(y, y); // y = x^4
  gf256Square(r, y); // r = x^8
  gf256Mul(z, r, x); // z = x^9
  gf256Square(r, r); // r = x^16
  gf256Mul(r, r, z); // r = x^25
  gf256Square(r, r); // r = x^50
  gf256Square(z, r); // z = x^100
  gf256Square(z, z); // z = x^200
  gf256Mul(r, r, z); // r = x^250
  gf256Mul(r, r, y); // r = x^254
  memzero(y);
  memzero(z);
}
