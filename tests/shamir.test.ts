// Tests ported from bc-shamir-rust, plus the TypeScript input contract.

import { runInNewContext } from "node:vm";
import { fillRandomBytes, type RandomNumberGenerator } from "@blockchaincommons/rand";
import {
  ShamirError,
  splitSecret,
  recoverSecret,
  MIN_SECRET_LENGTH,
  MAX_SECRET_LENGTH,
  MAX_SHARE_COUNT,
  type ShamirShare,
  type ShamirShareInput,
  type SplitOptions,
} from "../src/index.js";

/** The counter generator the Rust tests use: 0, 17, 34, … */
function fakeRng(): RandomNumberGenerator {
  return {
    nextU32: () => {
      throw new Error("not implemented");
    },
    nextU64: () => {
      throw new Error("not implemented");
    },
    fillBytes(data) {
      let b = 0;
      for (let i = 0; i < data.length; i++) {
        data[i] = b;
        b = (b + 17) & 0xff;
      }
    },
  };
}
const hexToBytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, "hex"));
const bytesToHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const pick = (shares: ShamirShare[], indexes: number[]): ShamirShare[] =>
  indexes.map((i) => shares[i]);

describe("constants", () => {
  it("match the reference", () => {
    expect([MIN_SECRET_LENGTH, MAX_SECRET_LENGTH, MAX_SHARE_COUNT]).toEqual([16, 32, 16]);
  });
});

describe("splitSecret", () => {
  it("3-of-5 over a 16-byte secret (Rust test_split_secret_3_5)", () => {
    const secret = hexToBytes("0ff784df000c4380a5ed683f7e6e3dcf");
    const shares = splitSecret(secret, { threshold: 3, shareCount: 5, rng: fakeRng() });
    expect(shares.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
    expect(shares.map((s) => bytesToHex(s.data))).toEqual([
      "00112233445566778899aabbccddeeff",
      "d43099fe444807c46921a4f33a2a798b",
      "d9ad4e3bec2e1a7485698823abf05d36",
      "0d8cf5f6ec337bc764d1866b5d07ca42",
      "1aa7fe3199bc5092ef3816b074cabdf2",
    ]);
    expect(bytesToHex(recoverSecret(pick(shares, [1, 2, 4])))).toBe(bytesToHex(secret));
  });

  it("bigint threshold and shareCount split like their number forms", () => {
    const secret = hexToBytes("0ff784df000c4380a5ed683f7e6e3dcf");
    const expected = splitSecret(secret, { threshold: 3, shareCount: 5, rng: fakeRng() });
    for (const options of [
      { threshold: 3n, shareCount: 5n },
      { threshold: 3, shareCount: 5n },
      { threshold: 3n, shareCount: 5 },
    ]) {
      const shares = splitSecret(secret, { ...options, rng: fakeRng() });
      expect(shares.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
      expect(shares.map((s) => bytesToHex(s.data))).toEqual(
        expected.map((s) => bytesToHex(s.data)),
      );
    }
  });

  it("bigint parameters past the safe range get the reference's codes", () => {
    const secret = new Uint8Array(16);
    const rng = fakeRng();
    const code = (f: () => unknown): string => {
      try {
        f();
        return "ok";
      } catch (e) {
        return (e as ShamirError).code;
      }
    };
    expect(code(() => splitSecret(secret, { threshold: 1n, shareCount: 2n ** 53n, rng }))).toBe(
      "TooManyShares",
    );
    expect(code(() => splitSecret(secret, { threshold: 2n ** 53n, shareCount: 1n, rng }))).toBe(
      "InvalidThreshold",
    );
    expect(
      code(() => splitSecret(secret, { threshold: 2n ** 64n - 1n, shareCount: 16n, rng })),
    ).toBe("InvalidThreshold");
    expect(
      code(() => splitSecret(secret, { threshold: 1n, shareCount: 2n ** 64n - 1n, rng })),
    ).toBe("TooManyShares");
    expect(code(() => splitSecret(secret, { threshold: 1n, shareCount: 2n ** 64n, rng }))).toBe(
      "InvalidParameter",
    );
    expect(code(() => splitSecret(secret, { threshold: -1n, shareCount: 3, rng }))).toBe(
      "InvalidParameter",
    );
    // A number past the safe range stays rejected: pass a bigint instead.
    expect(code(() => splitSecret(secret, { threshold: 1, shareCount: 2 ** 53, rng }))).toBe(
      "InvalidParameter",
    );
    expect(() => splitSecret(secret, { threshold: 1, shareCount: 2 ** 53, rng })).toThrow(
      "got 9007199254740992",
    );
  });

  it("2-of-7 over a 32-byte secret (Rust test_split_secret_2_7)", () => {
    const secret = hexToBytes("204188bfa6b440a1bdfd6753ff55a8241e07af5c5be943db917e3efabc184b1a");
    const shares = splitSecret(secret, { threshold: 2, shareCount: 7, rng: fakeRng() });
    expect(shares.map((s) => bytesToHex(s.data))).toEqual([
      "2dcd14c2252dc8489af3985030e74d5a48e8eff1478ab86e65b43869bf39d556",
      "a1dfdd798388aada635b9974472b4fc59a32ae520c42c9f6a0af70149b882487",
      "2ee99daf727c0c7773b89a18de64497ff7476dacd1015a45f482a893f7402cef",
      "a2fb5414d4d96ee58a109b3ca9a84be0259d2c0f9ac92bdd3199e0eed3f1dd3e",
      "2b851d188b8f5b3653659cc0f7fa45102dadf04b708767385cd803862fcb3c3f",
      "a797d4a32d2a39a4aacd9de48036478fff77b1e83b4f16a099c34bfb0b7acdee",
      "28a19475dcde9f09ba2e9e881979413592027216e60c8513cdee937c67b2c586",
    ]);
    expect(bytesToHex(recoverSecret(pick(shares, [3, 4])))).toBe(bytesToHex(secret));
  });

  it("defaults to the secure generator", () => {
    const secret = new TextEncoder().encode("my secret belongs to me.");
    const shares = splitSecret(secret, { threshold: 2, shareCount: 3 });
    expect(shares.length).toBe(3);
    expect(bytesToHex(recoverSecret(pick(shares, [0, 2])))).toBe(bytesToHex(secret));
    // Two splits with the secure generator differ.
    const again = splitSecret(secret, { threshold: 2, shareCount: 3 });
    expect(bytesToHex(again[0].data)).not.toBe(bytesToHex(shares[0].data));
  });

  it("threshold 1 returns copies of the secret and draws no randomness", () => {
    const secret = hexToBytes("0102030405060708091011121314151617181920212223242526272829303132");
    const rng = fakeRng();
    rng.fillBytes = () => {
      throw new Error("must not draw");
    };
    const shares = splitSecret(secret, { threshold: 1, shareCount: 5, rng });
    expect(shares.length).toBe(5);
    for (const s of shares) expect(bytesToHex(s.data)).toBe(bytesToHex(secret));
    expect(bytesToHex(recoverSecret([shares[2]]))).toBe(bytesToHex(secret));
  });
});

describe("recoverSecret", () => {
  it("recovers the README example from explicit shares", () => {
    const shares: ShamirShare[] = [
      {
        index: 0,
        data: new Uint8Array([
          47, 165, 102, 232, 218, 99, 6, 94, 39, 6, 253, 215, 12, 88, 64, 32, 105, 40, 222, 146, 93,
          197, 48, 129,
        ]),
      },
      {
        index: 2,
        data: new Uint8Array([
          221, 174, 116, 201, 90, 99, 136, 33, 64, 215, 60, 84, 207, 28, 74, 10, 111, 243, 43, 224,
          48, 64, 199, 172,
        ]),
      },
    ];
    expect(new TextDecoder().decode(recoverSecret(shares))).toBe("my secret belongs to me.");
  });
});

describe("errors", () => {
  const rng = fakeRng();
  const code = (f: () => unknown): string | undefined => {
    try {
      f();
      return undefined;
    } catch (e) {
      expect(ShamirError.isShamirError(e)).toBe(true);
      expect((e as Error).name).toBe("ShamirError");
      return (e as ShamirError).code;
    }
  };
  it("split parameter validation, in order", () => {
    expect(code(() => splitSecret(new Uint8Array(8), { threshold: 2, shareCount: 3, rng }))).toBe(
      "SecretTooShort",
    );
    expect(code(() => splitSecret(new Uint8Array(64), { threshold: 2, shareCount: 3, rng }))).toBe(
      "SecretTooLong",
    );
    expect(code(() => splitSecret(new Uint8Array(17), { threshold: 2, shareCount: 3, rng }))).toBe(
      "SecretNotEvenLen",
    );
    expect(code(() => splitSecret(new Uint8Array(16), { threshold: 2, shareCount: 20, rng }))).toBe(
      "TooManyShares",
    );
    expect(code(() => splitSecret(new Uint8Array(16), { threshold: 5, shareCount: 3, rng }))).toBe(
      "InvalidThreshold",
    );
    expect(code(() => splitSecret(new Uint8Array(16), { threshold: 0, shareCount: 3, rng }))).toBe(
      "InvalidThreshold",
    );
    expect(code(() => splitSecret(new Uint8Array(8), { threshold: 2, shareCount: 20, rng }))).toBe(
      "TooManyShares",
    );
  });
  it("messages are the reference strings", () => {
    expect(() => splitSecret(new Uint8Array(8), { threshold: 2, shareCount: 3, rng })).toThrow(
      "secret is too short",
    );
    expect(() => splitSecret(new Uint8Array(64), { threshold: 2, shareCount: 3, rng })).toThrow(
      "secret is too long",
    );
    expect(() => splitSecret(new Uint8Array(17), { threshold: 2, shareCount: 3, rng })).toThrow(
      "secret is not of even length",
    );
    expect(() => splitSecret(new Uint8Array(16), { threshold: 2, shareCount: 20, rng })).toThrow(
      "too many shares",
    );
    expect(() => splitSecret(new Uint8Array(16), { threshold: 5, shareCount: 3, rng })).toThrow(
      "invalid threshold",
    );
  });
  it("recover validation", () => {
    expect(code(() => recoverSecret([]))).toBe("InvalidThreshold");
    expect(
      code(() =>
        recoverSecret([
          { index: 0, data: new Uint8Array(16) },
          { index: 1, data: new Uint8Array(24) },
        ]),
      ),
    ).toBe("SharesUnequalLength");
    expect(() =>
      recoverSecret([
        { index: 0, data: new Uint8Array(16) },
        { index: 1, data: new Uint8Array(24) },
      ]),
    ).toThrow("shares have unequal length");
  });
  it("InvalidParameter for non-integer parameters, before the reference chain", () => {
    const secret = new Uint8Array(16);
    expect(code(() => splitSecret(secret, { threshold: 1, shareCount: NaN, rng }))).toBe(
      "InvalidParameter",
    );
    expect(() => splitSecret(secret, { threshold: 1.5, shareCount: 3, rng })).toThrow(
      "threshold must be an integer in [0, 9007199254740991] or a bigint in [0, 18446744073709551615], got 1.5",
    );
    // Rust-representable inputs keep the reference's code and order.
    expect(code(() => splitSecret(secret, { threshold: 2, shareCount: 17, rng }))).toBe(
      "TooManyShares",
    );
    expect(code(() => splitSecret(secret, { threshold: 0, shareCount: 3, rng }))).toBe(
      "InvalidThreshold",
    );
    expect(code(() => splitSecret(new Uint8Array(8), { threshold: 2, shareCount: 17, rng }))).toBe(
      "TooManyShares",
    );
  });
  it("InvalidParameter for a share index that is not a usize; 254 and duplicates go to the checksum", () => {
    const shares = splitSecret(hexToBytes("0ff784df000c4380a5ed683f7e6e3dcf"), {
      threshold: 3,
      shareCount: 5,
      rng: fakeRng(),
    });
    const relabel = (index: number | bigint) => [
      { index, data: shares[0].data },
      shares[1],
      shares[2],
    ];
    for (const index of [
      256,
      65536,
      2 ** 32,
      Number.MAX_SAFE_INTEGER - 255,
      256n,
      2n ** 64n - 256n,
    ]) {
      expect(recoverSecret(relabel(index))).toEqual(recoverSecret(relabel(0)));
    }
    // 2^64 - 1 is 255 as u8: the secret's own point, so the checksum fails.
    expect(code(() => recoverSecret(relabel(2n ** 64n - 1n)))).toBe("ChecksumFailure");
    expect(code(() => recoverSecret(relabel(-1n)))).toBe("InvalidParameter");
    expect(code(() => recoverSecret(relabel(2n ** 64n)))).toBe("InvalidParameter");
    expect(code(() => recoverSecret(relabel(-1)))).toBe("InvalidParameter");
    expect(code(() => recoverSecret(relabel(1.5)))).toBe("InvalidParameter");
    expect(code(() => recoverSecret(relabel(NaN)))).toBe("InvalidParameter");
    expect(() => recoverSecret(relabel(-1))).toThrow(
      "index must be an integer in [0, 9007199254740991] or a bigint in [0, 18446744073709551615], got -1",
    );
    expect(code(() => recoverSecret(relabel(254)))).toBe("ChecksumFailure");
    expect(code(() => recoverSecret([shares[0], shares[0], shares[2]]))).toBe("ChecksumFailure");
    // Length checks still come first.
    expect(code(() => recoverSecret([{ index: 256, data: new Uint8Array(8) }]))).toBe(
      "SecretTooShort",
    );
  });
  it("single-share recovery ignores supported labels and returns a copy", () => {
    const data = new Uint8Array(16);
    for (const index of [0, 255, 256, 300, Number.MAX_SAFE_INTEGER, 0n, 2n ** 64n - 1n]) {
      const recovered = recoverSecret([{ index, data }]);
      expect(recovered).toEqual(data);
      expect(recovered).not.toBe(data);
    }
    for (const index of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, -1n, 2n ** 64n]) {
      expect(code(() => recoverSecret([{ index, data }]))).toBe("InvalidParameter");
    }
    expect(
      code(() =>
        recoverSecret([
          { index: -1, data },
          { index: 1, data: new Uint8Array(18) },
        ]),
      ),
    ).toBe("SharesUnequalLength");
  });
  it("retains Rust's interpolation error variant", () => {
    const error = ShamirError.interpolationFailure();
    expect(error.message).toBe("interpolation failed");
    expect(error.is("InterpolationFailure")).toBe(true);
    expect(error.details).toEqual({ code: "InterpolationFailure" });
  });
  it("details, is(), and a cross-copy guard", () => {
    const e = ShamirError.invalidParameter("index", 1.5);
    expect(e.details).toEqual({ code: "InvalidParameter", parameter: "index", value: 1.5 });
    expect(e.is("InvalidParameter")).toBe(true);
    expect(e.is("ChecksumFailure")).toBe(false);
    expect(ShamirError.checksumFailure().details).toEqual({ code: "ChecksumFailure" });
    const foreign = Object.assign(new Error("checksum failure"), {
      name: "ShamirError",
      code: "ChecksumFailure",
    });
    expect(ShamirError.isShamirError(foreign)).toBe(true);
    expect(ShamirError.isShamirError(new Error("x"))).toBe(false);
    expect(ShamirError.isShamirError({ name: "ShamirError", code: "x" })).toBe(false);
  });
  it("shares are frozen objects over fresh buffers", () => {
    const secret = hexToBytes("0ff784df000c4380a5ed683f7e6e3dcf");
    for (const threshold of [1, 2]) {
      const s = splitSecret(secret, { threshold, shareCount: 3, rng: fakeRng() });
      expect(Object.isFrozen(s[0])).toBe(true);
      expect(s[0].data.buffer).not.toBe(secret.buffer);
      expect(() => {
        (s[0] as { index: number }).index = 9;
      }).toThrow(TypeError);
    }
  });
  it("checksum failure on a zeroed share", () => {
    const secret = hexToBytes("0ff784df000c4380a5ed683f7e6e3dcf");
    const shares = splitSecret(secret, { threshold: 3, shareCount: 5, rng: fakeRng() });
    const bad = [shares[0], shares[1], { index: 2, data: new Uint8Array(16) }];
    expect(code(() => recoverSecret(bad))).toBe("ChecksumFailure");
    expect(() => recoverSecret(bad)).toThrow("checksum failure");
  });
});

describe("argument types", () => {
  const secret = hexToBytes("0ff784df000c4380a5ed683f7e6e3dcf");
  /** `InvalidParameter:<parameter>`, another code, a foreign error, or `ok`. */
  const outcome = (f: () => unknown): string => {
    try {
      f();
      return "ok";
    } catch (e) {
      if (!ShamirError.isShamirError(e)) return `${(e as Error).name}: ${(e as Error).message}`;
      return e.details.code === "InvalidParameter"
        ? `InvalidParameter:${e.details.parameter}`
        : e.code;
    }
  };
  const anyCall = splitSecret as unknown as (...args: unknown[]) => unknown;
  const anyRecover = recoverSecret as unknown as (...args: unknown[]) => unknown;

  for (const threshold of [1, 3]) {
    describe(`with a threshold of ${threshold}`, () => {
      const options = (): SplitOptions => ({ threshold, shareCount: 3, rng: fakeRng() });
      const shares = (): ShamirShare[] => splitSecret(secret, options());

      it("secret must be a Uint8Array", () => {
        const wrong: unknown[] = [
          "0ff784df000c4380a5ed683f7e6e3dcf",
          Array.from(secret),
          new Uint16Array(8),
          new DataView(secret.buffer),
          secret.buffer,
          undefined,
          null,
          16,
        ];
        for (const bad of wrong) {
          expect(outcome(() => anyCall(bad, options()))).toBe("InvalidParameter:secret");
        }
        expect(() => anyCall("abc", options())).toThrow('secret must be a Uint8Array, got "abc"');
      });
      it("options must be an object, checked first", () => {
        for (const bad of [undefined, null, 3, "x", true]) {
          expect(outcome(() => anyCall(secret, bad))).toBe("InvalidParameter:options");
          expect(outcome(() => anyCall("not bytes", bad))).toBe("InvalidParameter:options");
        }
        expect(outcome(() => anyCall(secret))).toBe("InvalidParameter:options");
        expect(() => anyCall(secret, null)).toThrow("options must be an object, got null");
      });
      it("integer checks come before the secret check", () => {
        expect(outcome(() => anyCall("not bytes", { threshold: NaN, shareCount: 3 }))).toBe(
          "InvalidParameter:threshold",
        );
        expect(outcome(() => anyCall("not bytes", { threshold, shareCount: 2 ** 53 }))).toBe(
          "InvalidParameter:shareCount",
        );
        expect(outcome(() => anyCall("not bytes", { threshold, shareCount: 3 }))).toBe(
          "InvalidParameter:secret",
        );
      });
      it("shares must be an array", () => {
        for (const bad of ["ab", undefined, null, new Set(shares()), { length: 1 }, 3]) {
          expect(outcome(() => anyRecover(bad))).toBe("InvalidParameter:shares");
        }
        expect(() => anyRecover("ab")).toThrow('shares must be an array, got "ab"');
      });
      it("every share must be an object with Uint8Array data", () => {
        const s = shares();
        const sparse: unknown[] = [];
        sparse[1] = s[1];
        expect(outcome(() => anyRecover(sparse))).toBe("InvalidParameter:share");
        expect(outcome(() => anyRecover([null, ...s.slice(1, threshold)]))).toBe(
          "InvalidParameter:share",
        );
        expect(outcome(() => anyRecover(["share", ...s.slice(1, threshold)]))).toBe(
          "InvalidParameter:share",
        );
        const withData = (data: unknown): unknown[] => [
          { index: 0, data },
          ...s.slice(1, threshold),
        ];
        for (const bad of [Array.from(s[0].data), undefined, "00", new Uint16Array(8), 7]) {
          expect(outcome(() => anyRecover(withData(bad)))).toBe("InvalidParameter:data");
        }
        expect(() => anyRecover(withData([1, 2]))).toThrow("data must be a Uint8Array, got Array");
      });
      it("type checks precede the reference checks and the index check", () => {
        // An empty array is the reference's InvalidThreshold; a non-array is not.
        expect(outcome(() => anyRecover([]))).toBe("InvalidThreshold");
        // Wrong data type on a later share wins over the first share's bad index.
        expect(
          outcome(() =>
            anyRecover([
              { index: NaN, data: new Uint8Array(16) },
              { index: 1, data: [1] },
            ]),
          ),
        ).toBe("InvalidParameter:data");
        // Unequal lengths still come before the index check.
        expect(
          outcome(() =>
            anyRecover([
              { index: NaN, data: new Uint8Array(16) },
              { index: 1, data: new Uint8Array(18) },
            ]),
          ),
        ).toBe("SharesUnequalLength");
      });
      it("accepts a Buffer and a Uint8Array from another realm", () => {
        const fromBuffer = splitSecret(Buffer.from(secret), options());
        expect(fromBuffer.map((s) => bytesToHex(s.data))).toEqual(
          shares().map((s) => bytesToHex(s.data)),
        );
        const foreign = runInNewContext("new Uint8Array(16)") as Uint8Array;
        foreign.set(secret);
        expect(foreign).not.toBeInstanceOf(Uint8Array);
        const fromForeign = splitSecret(foreign, options());
        expect(fromForeign.map((s) => bytesToHex(s.data))).toEqual(
          shares().map((s) => bytesToHex(s.data)),
        );
        const asBuffers = shares()
          .slice(0, threshold)
          .map((s) => ({ index: s.index, data: Buffer.from(s.data) }));
        expect(bytesToHex(recoverSecret(asBuffers))).toBe(bytesToHex(secret));
        const asForeign = shares()
          .slice(0, threshold)
          .map((s) => {
            const data = runInNewContext("new Uint8Array(16)") as Uint8Array;
            data.set(s.data);
            return { index: s.index, data };
          });
        expect(bytesToHex(recoverSecret(asForeign))).toBe(bytesToHex(secret));
      });
    });
  }

  it("reads each share's index and data exactly once", () => {
    const s = splitSecret(secret, { threshold: 3, shareCount: 5, rng: fakeRng() });
    const reads = { index: 0, data: 0 };
    const spied: ShamirShareInput[] = s.slice(0, 3).map((share) => ({
      get index() {
        reads.index++;
        return share.index;
      },
      get data() {
        reads.data++;
        return share.data;
      },
    }));
    expect(bytesToHex(recoverSecret(spied))).toBe(bytesToHex(secret));
    expect(reads).toEqual({ index: 3, data: 3 });
  });
  it("uses the first read of a changing getter, so validation and interpolation agree", () => {
    const s = splitSecret(secret, { threshold: 3, shareCount: 5, rng: fakeRng() });
    const changing = (values: unknown[]): ShamirShareInput => {
      let n = 0;
      return {
        get index() {
          return values[n++ % values.length] as number;
        },
        data: s[0].data,
      };
    };
    // NaN first: rejected. 7 first: label 7 on share 0's bytes fails the checksum.
    expect(() => recoverSecret([changing([NaN, 7]), s[1], s[2]])).toThrow(
      "index must be an integer",
    );
    expect(() => recoverSecret([changing([7, NaN]), s[1], s[2]])).toThrow("checksum failure");
    expect(bytesToHex(recoverSecret([changing([0, NaN]), s[1], s[2]]))).toBe(bytesToHex(secret));
    // Data that grows after the first read: the 16-byte snapshot is used.
    let dataReads = 0;
    const growing: ShamirShareInput = {
      index: 0,
      get data() {
        dataReads++;
        return dataReads === 1 ? s[0].data : new Uint8Array(18);
      },
    };
    expect(bytesToHex(recoverSecret([growing, s[1], s[2]]))).toBe(bytesToHex(secret));
    expect(dataReads).toBe(1);
  });
});

describe("generators", () => {
  const secret = hexToBytes("0ff784df000c4380a5ed683f7e6e3dcf");
  it("a generator's own error propagates unwrapped and nothing is returned", () => {
    const rng = fakeRng();
    rng.fillBytes = () => {
      throw new RangeError("boom");
    };
    expect(() => splitSecret(secret, { threshold: 2, shareCount: 3, rng })).toThrow(RangeError);
    expect(() => splitSecret(secret, { threshold: 2, shareCount: 3, rng })).toThrow("boom");
  });
  it("a generator without a callable fillBytes fails at the first draw with rand's InvalidGenerator", () => {
    const rng = {} as RandomNumberGenerator;
    let caught: unknown;
    try {
      splitSecret(secret, { threshold: 2, shareCount: 3, rng });
    } catch (e) {
      caught = e;
    }
    let fromRand: unknown;
    try {
      fillRandomBytes(new Uint8Array(4), { rng });
    } catch (e) {
      fromRand = e;
    }
    const err = caught as Error & { code: string; details: { method?: string } };
    expect(err.name).toBe("RandError");
    expect(err.code).toBe("InvalidGenerator");
    expect(err.details.method).toBe("fillBytes");
    expect(ShamirError.isShamirError(caught)).toBe(false);
    expect(err.message).toBe((fromRand as Error).message);
    expect((fromRand as Error).name).toBe("RandError");
  });
  it("argument validation comes before the draw", () => {
    const rng = {} as RandomNumberGenerator;
    const code = (f: () => unknown): string => {
      try {
        f();
        return "ok";
      } catch (e) {
        return (e as Error & { code: string }).code;
      }
    };
    expect(code(() => splitSecret(secret, { threshold: 2, shareCount: 20, rng }))).toBe(
      "TooManyShares",
    );
    expect(code(() => splitSecret(new Uint8Array(8), { threshold: 2, shareCount: 3, rng }))).toBe(
      "SecretTooShort",
    );
    expect(code(() => splitSecret(secret, { threshold: 2, shareCount: 3, rng }))).toBe(
      "InvalidGenerator",
    );
  });
  it("a threshold of 1 never touches the generator", () => {
    const shares = splitSecret(secret, {
      threshold: 1,
      shareCount: 2,
      rng: {} as RandomNumberGenerator,
    });
    expect(shares.map((s) => bytesToHex(s.data))).toEqual([bytesToHex(secret), bytesToHex(secret)]);
  });
  it("an undefined or null rng selects the secure generator", () => {
    for (const rng of [undefined, null]) {
      const shares = splitSecret(secret, {
        threshold: 2,
        shareCount: 2,
        rng: rng as unknown as RandomNumberGenerator,
      });
      expect(shares.length).toBe(2);
      expect(bytesToHex(recoverSecret(shares))).toBe(bytesToHex(secret));
    }
  });
});
