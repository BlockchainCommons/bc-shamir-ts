/**
 * Cross-platform fixture parity: share bytes produced by `bc-shamir-rust`
 * (the reference) decoded by the TypeScript `recoverSecret`, proving a
 * third party's Rust output recovers here without touching the split path.
 * Source: `bc-shamir-rust/src/lib.rs` `test_split_secret_3_5` and
 * `test_split_secret_2_7`.
 */
import { recoverSecret, ShamirError, type ShamirShare } from "../src/index.js";

const share = (index: number, hex: string): ShamirShare => ({
  index,
  data: Uint8Array.from(Buffer.from(hex, "hex")),
});
const bytesToHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

describe("Cross-platform Rust → TS share decoding", () => {
  const RUST_3_5_SECRET = "0ff784df000c4380a5ed683f7e6e3dcf";
  const RUST_3_5_SHARES = [
    "00112233445566778899aabbccddeeff",
    "d43099fe444807c46921a4f33a2a798b",
    "d9ad4e3bec2e1a7485698823abf05d36",
    "0d8cf5f6ec337bc764d1866b5d07ca42",
    "1aa7fe3199bc5092ef3816b074cabdf2",
  ];
  for (const indexes of [
    [1, 2, 4],
    [0, 1, 2],
    [2, 3, 4],
    [0, 3, 4],
  ]) {
    it(`recovers the 3/5 secret from shares ${indexes.join(",")}`, () => {
      const recovered = recoverSecret(indexes.map((i) => share(i, RUST_3_5_SHARES[i]!)));
      expect(bytesToHex(recovered)).toBe(RUST_3_5_SECRET);
    });
  }

  const RUST_2_7_SECRET = "204188bfa6b440a1bdfd6753ff55a8241e07af5c5be943db917e3efabc184b1a";
  const RUST_2_7_SHARES = [
    "2dcd14c2252dc8489af3985030e74d5a48e8eff1478ab86e65b43869bf39d556",
    "a1dfdd798388aada635b9974472b4fc59a32ae520c42c9f6a0af70149b882487",
    "2ee99daf727c0c7773b89a18de64497ff7476dacd1015a45f482a893f7402cef",
    "a2fb5414d4d96ee58a109b3ca9a84be0259d2c0f9ac92bdd3199e0eed3f1dd3e",
    "2b851d188b8f5b3653659cc0f7fa45102dadf04b708767385cd803862fcb3c3f",
    "a797d4a32d2a39a4aacd9de48036478fff77b1e83b4f16a099c34bfb0b7acdee",
    "28a19475dcde9f09ba2e9e881979413592027216e60c8513cdee937c67b2c586",
  ];
  it("recovers the 2/7 secret from every two-share combination", () => {
    let combinations = 0;
    for (let i = 0; i < 7; i++)
      for (let j = i + 1; j < 7; j++) {
        const recovered = recoverSecret([
          share(i, RUST_2_7_SHARES[i]!),
          share(j, RUST_2_7_SHARES[j]!),
        ]);
        expect(bytesToHex(recovered)).toBe(RUST_2_7_SECRET);
        combinations++;
      }
    expect(combinations).toBe(21);
  });

  it("rejects a tampered Rust-produced share with ChecksumFailure", () => {
    const tampered = share(1, RUST_3_5_SHARES[1]!);
    tampered.data[0] ^= 0x01;
    const shares = [share(0, RUST_3_5_SHARES[0]!), tampered, share(2, RUST_3_5_SHARES[2]!)];
    expect(() => recoverSecret(shares)).toThrow(ShamirError);
    try {
      recoverSecret(shares);
    } catch (e) {
      expect((e as ShamirError).code).toBe("ChecksumFailure");
    }
  });
});
