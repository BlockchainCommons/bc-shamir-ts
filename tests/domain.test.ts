import { ShamirError } from "../src/error";
import { expectInt, isIntIn, U8, USIZE } from "../src/domain";

describe("domain", () => {
  it("usize accepts safe non-negative integers only", () => {
    for (const v of [0, 1, 16, 2 ** 53 - 1]) expect(isIntIn(v, USIZE)).toBe(true);
    for (const v of [-1, 0.5, 1.5, NaN, Infinity, -Infinity, 2 ** 53]) {
      expect(isIntIn(v, USIZE)).toBe(false);
    }
  });
  it("u8 accepts integers in [0, 255] only", () => {
    for (const v of [0, 1, 254, 255]) expect(isIntIn(v, U8)).toBe(true);
    for (const v of [-1, 256, 65536, 1.5, NaN]) expect(isIntIn(v, U8)).toBe(false);
  });
  it("expectInt throws InvalidParameter with the parameter, value and one message shape", () => {
    expect(() => expectInt("index", 0, U8)).not.toThrow();
    try {
      expectInt("shareCount", NaN, USIZE);
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
      expect(err.message).toBe("shareCount must be an integer in [0, 9007199254740991], got NaN");
    }
    expect(() => expectInt("index", 256, U8)).toThrow(
      "index must be an integer in [0, 255], got 256",
    );
  });
});
