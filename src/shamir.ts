/**
 * Split and recover.
 *
 * @module shamir
 */
import { hmacSha256, memzero, memzeroAll } from "@blockchaincommons/crypto";
import { fillRandomBytes, type RngOptions } from "@blockchaincommons/rand";
import { MAX_SECRET_LENGTH, MAX_SHARE_COUNT, MIN_SECRET_LENGTH } from "./constants.js";
import { expectUsize, isBytes, isRecord, toU8 } from "./domain.js";
import { ShamirError } from "./error.js";
import { interpolate } from "./interpolate.js";

// The polynomial's x-coordinates for the secret and its digest; shares use 0..n-1.
const SECRET_INDEX = 255;
const DIGEST_INDEX = 254;

/**
 * A share handed to {@link recoverSecret}: its x-coordinate and the y-bytes.
 * Both are wire.
 */
export interface ShamirShareInput {
  /**
   * The x-coordinate: a safe non-negative integer `number`, or a `bigint` in
   * `[0, 2^64 - 1]` for values a `number` cannot hold exactly. Recovery
   * narrows it to its low eight bits, as the reference's `as u8` does, so
   * `256` names the same point as `0`.
   */
  readonly index: number | bigint;
  /** The y-bytes; every share of one split has the secret's length. */
  readonly data: Uint8Array;
}

/**
 * One share as {@link splitSecret} returns it: frozen, with a fresh `data`
 * buffer and the `number` index `0..shareCount-1`.
 */
export interface ShamirShare extends ShamirShareInput {
  /** The x-coordinate; `splitSecret` assigns `0..shareCount-1`. */
  readonly index: number;
  /** The y-bytes; every share of one split has the secret's length. */
  readonly data: Uint8Array;
}

/** Options for {@link splitSecret}; `rng` is rand's option, secure by default. */
export interface SplitOptions extends RngOptions {
  /** Shares needed to recover; `1 ≤ threshold ≤ shareCount`. A safe-integer `number` or a `bigint`. */
  readonly threshold: number | bigint;
  /** Shares produced; at most {@link MAX_SHARE_COUNT}. A safe-integer `number` or a `bigint`. */
  readonly shareCount: number | bigint;
}

// The digest share's first four bytes: an HMAC of the secret keyed by the
// share's random tail, which is what recovery checks.
function digestOf(randomTail: Uint8Array, secret: Uint8Array): Uint8Array {
  return hmacSha256(randomTail, secret);
}

// The reference's five checks, in its order; consumers branch on the first
// failure. The comparisons are exact in bigint, so a value up to 2^64 - 1
// gets the reference's code. Both counts are at most 16 on return.
function validate(threshold: bigint, shareCount: bigint, secretLength: number): [number, number] {
  if (shareCount > BigInt(MAX_SHARE_COUNT)) throw ShamirError.tooManyShares();
  if (threshold < 1n || threshold > shareCount) throw ShamirError.invalidThreshold();
  if (secretLength > MAX_SECRET_LENGTH) throw ShamirError.secretTooLong();
  if (secretLength < MIN_SECRET_LENGTH) throw ShamirError.secretTooShort();
  if ((secretLength & 1) !== 0) throw ShamirError.secretNotEvenLen();
  return [Number(threshold), Number(shareCount)];
}

/**
 * Split `secret` into `shareCount` shares, any `threshold` of which recover
 * it. The secret must be 16–32 bytes and even-length.
 *
 * With `threshold` 1 every share is a copy of the secret and no randomness
 * is drawn. Otherwise `threshold - 2` shares are drawn whole from `rng`,
 * then `secret.length - 4` bytes for the digest share's tail; the remaining
 * shares are interpolated. That draw order is wire. Draws go through rand's
 * `fillRandomBytes`, so rand's generator contract applies: a generator's own
 * error propagates unwrapped, and one without a callable `fillBytes` fails at
 * the first draw with rand's `RandError` `InvalidGenerator`.
 *
 * @throws {ShamirError} `InvalidParameter` when `options` is not an object,
 * when `threshold` or `shareCount` is not a `usize` (a safe non-negative
 * integer `number` or a `bigint` in `[0, 2^64 - 1]`), or when `secret` is
 * not a `Uint8Array`, in that order; then `TooManyShares`,
 * `InvalidThreshold`, `SecretTooLong`, `SecretTooShort`, `SecretNotEvenLen`,
 * checked in that order.
 */
export function splitSecret(secret: Uint8Array, options: SplitOptions): ShamirShare[] {
  if (!isRecord(options)) throw ShamirError.invalidParameter("options", options);
  const { threshold: thresholdInput, shareCount: shareCountInput, rng } = options;
  const t = expectUsize("threshold", thresholdInput);
  const n = expectUsize("shareCount", shareCountInput);
  if (!isBytes(secret)) throw ShamirError.invalidParameter("secret", secret);
  const length = secret.length;
  const [threshold, shareCount] = validate(t, n, length);

  if (threshold === 1) {
    return Array.from({ length: shareCount }, (_, index) =>
      Object.freeze({ index, data: new Uint8Array(secret) }),
    );
  }

  const draw: RngOptions = { rng };
  const points = threshold; // threshold - 2 random shares + digest + secret
  const x = new Uint8Array(points);
  const y: Uint8Array[] = Array.from({ length: points }, () => new Uint8Array(length));
  const result: Uint8Array[] = Array.from({ length: shareCount }, () => new Uint8Array(length));
  let count = 0;

  for (let index = 0; index < threshold - 2; index++) {
    fillRandomBytes(result[index], draw);
    x[count] = index;
    y[count].set(result[index]);
    count++;
  }

  const digest = new Uint8Array(length);
  fillRandomBytes(digest.subarray(4), draw);
  digest.set(digestOf(digest.subarray(4), secret).subarray(0, 4), 0);
  x[count] = DIGEST_INDEX;
  y[count].set(digest);
  count++;

  x[count] = SECRET_INDEX;
  y[count].set(secret);
  count++;

  for (let index = threshold - 2; index < shareCount; index++) {
    result[index].set(interpolate(count, x, length, y, index));
  }

  memzero(digest);
  memzero(x);
  memzeroAll(y);
  return result.map((data, index) => Object.freeze({ index, data }));
}

/**
 * Recover the secret from `shares`; their count is the threshold.
 *
 * Each share's `index` and `data` are read once, before any check, and the
 * snapshot is what validation and interpolation see.
 *
 * @throws {ShamirError} `InvalidParameter` when `shares` is not an array,
 * a share is not an object, or its `data` is not a `Uint8Array`; then
 * `InvalidThreshold` for no shares, `TooManyShares` above
 * {@link MAX_SHARE_COUNT}, the length codes for malformed share data,
 * `SharesUnequalLength`, `InvalidParameter` for an `index` that is not a
 * `usize` (a safe non-negative integer `number` or a `bigint` in
 * `[0, 2^64 - 1]`), and `ChecksumFailure` when the shares do not belong
 * together or have been altered. Indexes 254 and 255 and duplicates are
 * left to the checksum, as the reference leaves them; an index above 255
 * is narrowed to its low eight bits, and a single share's index is not read.
 */
export function recoverSecret(shares: readonly ShamirShareInput[]): Uint8Array<ArrayBuffer> {
  const input: unknown = shares;
  if (!Array.isArray(input)) throw ShamirError.invalidParameter("shares", input);
  const items: readonly unknown[] = input;
  const snapshot = Array.from({ length: items.length }, (_, i) => {
    const share = items[i];
    if (!isRecord(share)) throw ShamirError.invalidParameter("share", share);
    const { index, data } = share;
    if (!isBytes(data)) throw ShamirError.invalidParameter("data", data);
    return { index, data, length: data.length };
  });

  const threshold = snapshot.length;
  if (threshold === 0) throw ShamirError.invalidThreshold();
  const length = snapshot[0].length;
  validate(BigInt(threshold), BigInt(threshold), length);
  if (!snapshot.every((s) => s.length === length)) throw ShamirError.sharesUnequalLength();
  const labels = snapshot.map((s) => expectUsize("index", s.index));

  if (threshold === 1) return new Uint8Array(snapshot[0].data);

  const x = Uint8Array.from(labels, toU8);
  const y = snapshot.map((s) => s.data);
  const digest = interpolate(threshold, x, length, y, DIGEST_INDEX);
  const secret = interpolate(threshold, x, length, y, SECRET_INDEX);
  const expected = digestOf(digest.subarray(4), secret);

  // Constant-time over the four digest bytes.
  let diff = 0;
  for (let i = 0; i < 4; i++) diff |= digest[i] ^ expected[i];

  memzero(digest);
  memzero(expected);
  if (diff !== 0) {
    memzero(secret);
    throw ShamirError.checksumFailure();
  }
  return secret;
}
