// Tests ported from bc-shamir-rust, expressed against the redesigned API.

import type { RandomNumberGenerator } from "@blockchaincommons/rand";
import {
  ShamirError,
  splitSecret,
  recoverSecret,
  MIN_SECRET_LENGTH,
  MAX_SECRET_LENGTH,
  MAX_SHARE_COUNT,
  type ShamirShare,
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
  indexes.map((i) => shares[i]!);

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
    expect(bytesToHex(again[0]!.data)).not.toBe(bytesToHex(shares[0]!.data));
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
    expect(bytesToHex(recoverSecret([shares[2]!]))).toBe(bytesToHex(secret));
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
  it("checksum failure on a zeroed share", () => {
    const secret = hexToBytes("0ff784df000c4380a5ed683f7e6e3dcf");
    const shares = splitSecret(secret, { threshold: 3, shareCount: 5, rng: fakeRng() });
    const bad = [shares[0]!, shares[1]!, { index: 2, data: new Uint8Array(16) }];
    expect(code(() => recoverSecret(bad))).toBe("ChecksumFailure");
    expect(() => recoverSecret(bad)).toThrow("checksum failure");
  });
});
