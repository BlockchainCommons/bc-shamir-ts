/**
 * Split a secret with a seeded generator (reproducible shares), recover it
 * from a subset, and see what a tampered share does.
 *
 *   bun examples/split-and-recover.ts
 */
import { SeededRng } from "@blockchaincommons/rand";
import { ShamirError, recoverSecret, splitSecret } from "../src/index";

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const secret = new TextEncoder().encode("my secret belongs to me."); // 24 bytes, even

// A seeded generator makes the split reproducible; omit `rng` for the secure default.
const shares = splitSecret(secret, { threshold: 3, shareCount: 5, rng: SeededRng.forTesting() });
for (const s of shares) console.log(`share ${s.index}  ${hex(s.data)}`);

// Any three shares recover the secret; their order does not matter.
const recovered = recoverSecret([shares[4]!, shares[1]!, shares[2]!]);
console.log("recovered ", new TextDecoder().decode(recovered));

// Two shares cannot: the four-byte checksum fails.
try {
  recoverSecret([shares[0]!, shares[1]!]);
} catch (e) {
  if (ShamirError.isShamirError(e)) console.log("two shares", e.code);
}

// One flipped byte in an otherwise valid set fails the same way.
const tampered = { index: shares[0]!.index, data: Uint8Array.from(shares[0]!.data) };
tampered.data[3] ^= 0x01;
try {
  recoverSecret([tampered, shares[1]!, shares[2]!]);
} catch (e) {
  if (ShamirError.isShamirError(e)) console.log("tampered  ", e.code, "-", e.message);
}
