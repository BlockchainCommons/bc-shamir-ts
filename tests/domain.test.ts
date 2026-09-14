import { ShamirError } from "../src/error";
import { USIZE_MAX, expectUsize, toU8, usizeOf } from "../src/domain";

const DOMAIN = "an integer in [0, 9007199254740991] or a bigint in [0, 18446744073709551615]";

describe("domain", () => {
  it("usizeOf accepts safe non-negative integer numbers and bigints up to 2^64 - 1, exactly", () => {
    expect(usizeOf(0)).toBe(0n);
    expect(usizeOf(-0)).toBe(0n);
    expect(usizeOf(1)).toBe(1n);
    expect(usizeOf(16)).toBe(16n);
    expect(usizeOf(2 ** 53 - 1)).toBe(9007199254740991n);
    expect(usizeOf(0n)).toBe(0n);
    expect(usizeOf(255n)).toBe(255n);
    expect(usizeOf(2n ** 53n)).toBe(9007199254740992n);
    expect(usizeOf(2n ** 64n - 1n)).toBe(USIZE_MAX);
  });
  it("usizeOf rejects unsafe numbers, non-integers, negatives, bigints past 2^64 - 1 and non-numbers", () => {
    const rejected: unknown[] = [
      2 ** 53,
      2 ** 64,
      -1,
      1.5,
      NaN,
      Infinity,
      -Infinity,
      -1n,
      2n ** 64n,
      "2",
      null,
      undefined,
      {},
      [],
    ];
    for (const v of rejected) expect(usizeOf(v)).toBeUndefined();
  });
  it("toU8 is the reference's `as u8`", () => {
    expect(toU8(0n)).toBe(0);
    expect(toU8(254n)).toBe(254);
    expect(toU8(255n)).toBe(255);
    expect(toU8(256n)).toBe(0);
    expect(toU8(511n)).toBe(255);
    expect(toU8(2n ** 64n - 1n)).toBe(255);
    expect(toU8(2n ** 64n - 256n)).toBe(0);
    expect(toU8(2n ** 53n + 255n)).toBe(255);
  });
  it("expectUsize returns the exact bigint or throws InvalidParameter with the parameter and value", () => {
    expect(expectUsize("index", 0)).toBe(0n);
    expect(expectUsize("index", 300)).toBe(300n);
    expect(expectUsize("threshold", 2n ** 64n - 1n)).toBe(USIZE_MAX);
    try {
      expectUsize("shareCount", NaN);
      expect.unreachable();
    } catch (e) {
      expect(ShamirError.isShamirError(e)).toBe(true);
      const err = e as ShamirError;
      expect(err.is("InvalidParameter")).toBe(true);
      expect(err.details).toEqual({
        code: "InvalidParameter",
        parameter: "shareCount",
        value: NaN,
      });
      expect(err.message).toBe(`shareCount must be ${DOMAIN}, got NaN`);
    }
  });
  it("renders the received value exactly in the message", () => {
    const rendered = (value: unknown): string =>
      ShamirError.invalidParameter("threshold", value).message.replace(
        `threshold must be ${DOMAIN}, got `,
        "",
      );
    expect(rendered(NaN)).toBe("NaN");
    expect(rendered(Infinity)).toBe("Infinity");
    expect(rendered(1.5)).toBe("1.5");
    expect(rendered(-1)).toBe("-1");
    expect(rendered(9007199254740992)).toBe("9007199254740992");
    expect(rendered(2 ** 64)).toBe("18446744073709551616");
    expect(rendered(2n)).toBe("2n");
    expect(rendered(-1n)).toBe("-1n");
    expect(rendered(2n ** 64n)).toBe("18446744073709551616n");
    expect(rendered("2")).toBe('"2"');
    expect(rendered(null)).toBe("null");
    expect(rendered(undefined)).toBe("undefined");
    expect(rendered(true)).toBe("true");
    expect(rendered([])).toBe("Array");
    expect(rendered({})).toBe("Object");
    expect(rendered(new Uint8Array(2))).toBe("Uint8Array");
    expect(rendered(Object.create(null))).toBe("object");
    expect(rendered(() => 1)).toBe("function");
  });
});
