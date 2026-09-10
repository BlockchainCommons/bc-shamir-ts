/**
 * Pins the bitsliced GF(2^8) arithmetic against scalar reference
 * implementations and exercises the register-size guards.
 */
import {
  bitslice,
  bitsliceSetall,
  gf256Add,
  gf256Inv,
  gf256Mul,
  gf256Square,
  unbitslice,
} from "../src/hazmat";

// Scalar reference: multiply modulo x^8 + x^4 + x^3 + x + 1 (0x11b).
function mulRef(a: number, b: number): number {
  let r = 0;
  for (let i = 0; i < 8; i++) {
    if ((b >> i) & 1) r ^= a << i;
  }
  for (let i = 14; i >= 8; i--) {
    if ((r >> i) & 1) r ^= 0x11b << (i - 8);
  }
  return r & 0xff;
}
const lanes = (f: (i: number) => number): Uint8Array =>
  Uint8Array.from({ length: 32 }, (_, i) => f(i));
const reg = (): Uint32Array => new Uint32Array(8);
const slice = (x: Uint8Array): Uint32Array => {
  const r = reg();
  bitslice(r, x);
  return r;
};
const unslice = (r: Uint32Array): Uint8Array => {
  const out = new Uint8Array(32);
  unbitslice(out, r);
  return out;
};

describe("hazmat GF(2^8)", () => {
  it("bitslice/unbitslice round-trip", () => {
    const x = lanes((i) => (i * 37 + 5) & 0xff);
    expect(unslice(slice(x))).toEqual(x);
  });
  it("setall broadcasts a byte", () => {
    const r = reg();
    bitsliceSetall(r, 0xa5);
    expect(unslice(r)).toEqual(lanes(() => 0xa5));
  });
  it("add is XOR lane-wise", () => {
    const a = lanes((i) => i * 3);
    const b = lanes((i) => 255 - i);
    const r = slice(a);
    gf256Add(r, slice(b));
    expect(unslice(r)).toEqual(lanes((i) => a[i]! ^ b[i]!));
  });
  it("mul matches the scalar reference over every lane, with r aliasing a", () => {
    for (let k = 0; k < 8; k++) {
      const a = lanes((i) => (i * 29 + k * 61) & 0xff);
      const b = lanes((i) => (i * 113 + k * 7 + 1) & 0xff);
      const r = slice(a);
      gf256Mul(r, r, slice(b));
      expect(unslice(r)).toEqual(lanes((i) => mulRef(a[i]!, b[i]!)));
    }
  });
  it("square equals mul(x, x), with r aliasing x", () => {
    const x = lanes((i) => (i * 53 + 9) & 0xff);
    const r = slice(x);
    gf256Square(r, r);
    expect(unslice(r)).toEqual(lanes((i) => mulRef(x[i]!, x[i]!)));
  });
  it("inv gives x * inv(x) = 1 for non-zero lanes and 0 for zero lanes", () => {
    const x = lanes((i) => (i * 17) & 0xff); // lane 0 (and 15: 255) — lane 0 is zero
    const inv = reg();
    gf256Inv(inv, slice(x), reg(), reg());
    const back = unslice(inv);
    for (let i = 0; i < 32; i++) expect(mulRef(x[i]!, back[i]!)).toBe(x[i] === 0 ? 0 : 1);
    // scratch registers are zeroed
    const y = reg();
    const z = reg();
    gf256Inv(reg(), slice(x), y, z);
    expect([...y, ...z].every((w) => w === 0)).toBe(true);
  });
  it("guards reject wrong register sizes", () => {
    expect(() => bitslice(new Uint32Array(7), new Uint8Array(32))).toThrow(RangeError);
    expect(() => bitslice(reg(), new Uint8Array(31))).toThrow(RangeError);
    expect(() => unbitslice(new Uint8Array(31), reg())).toThrow(RangeError);
    expect(() => unbitslice(new Uint8Array(32), new Uint32Array(9))).toThrow(RangeError);
    expect(() => bitsliceSetall(new Uint32Array(1), 1)).toThrow(RangeError);
    expect(() => gf256Add(reg(), new Uint32Array(2))).toThrow(RangeError);
    expect(() => gf256Mul(reg(), reg(), new Uint32Array(2))).toThrow(RangeError);
    expect(() => gf256Square(reg(), new Uint32Array(2))).toThrow(RangeError);
    expect(() => gf256Inv(reg(), reg(), reg(), new Uint32Array(2))).toThrow(RangeError);
  });
});
