/**
 * Split and recover.
 *
 * @module shamir
 */
import { hmacSha256, memzero, memzeroAll } from "@blockchaincommons/crypto";
import { type RngOptions, secureRng } from "@blockchaincommons/rand";
import { MAX_SECRET_LENGTH, MAX_SHARE_COUNT, MIN_SECRET_LENGTH } from "./constants.js";
import { U8, USIZE, expectInt } from "./domain.js";
import { ShamirError } from "./error.js";
import { interpolate } from "./interpolate.js";

// The polynomial's x-coordinates for the secret and its digest; shares use 0..n-1.
const SECRET_INDEX = 255;
const DIGEST_INDEX = 254;

/**
 * One share: its x-coordinate and the y-bytes. Both are wire. The objects
 * {@link splitSecret} returns are frozen; `data` is a fresh buffer that may
 * be a view when the share comes from elsewhere.
 */
export interface ShamirShare {
  /** The x-coordinate, an integer in `[0, 255]`; `splitSecret` assigns `0..shareCount-1`. */
  readonly index: number;
  /** The y-bytes; every share of one split has the secret's length. */
  readonly data: Uint8Array;
}

/** Options for {@link splitSecret}; `rng` is rand's option, secure by default. */
export interface SplitOptions extends RngOptions {
  /** Shares needed to recover; `1 ≤ threshold ≤ shareCount`. */
  readonly threshold: number;
  /** Shares produced; at most {@link MAX_SHARE_COUNT}. */
  readonly shareCount: number;
}

// The digest share's first four bytes: an HMAC of the secret keyed by the
// share's random tail, which is what recovery checks.
function digestOf(randomTail: Uint8Array, secret: Uint8Array): Uint8Array {
  return hmacSha256(randomTail, secret);
}

// Check order is contractual; consumers branch on the first failure. The
// integer checks come first so that every input the reference's `usize`
// can express still gets the reference's code in the reference's order.
function validate(threshold: number, shareCount: number, secretLength: number): void {
  expectInt("threshold", threshold, USIZE);
  expectInt("shareCount", shareCount, USIZE);
  if (shareCount > MAX_SHARE_COUNT) throw ShamirError.tooManyShares();
  if (threshold < 1 || threshold > shareCount) throw ShamirError.invalidThreshold();
  if (secretLength > MAX_SECRET_LENGTH) throw ShamirError.secretTooLong();
  if (secretLength < MIN_SECRET_LENGTH) throw ShamirError.secretTooShort();
  if ((secretLength & 1) !== 0) throw ShamirError.secretNotEvenLen();
}

/**
 * Split `secret` into `shareCount` shares, any `threshold` of which recover
 * it. The secret must be 16–32 bytes and even-length.
 *
 * With `threshold` 1 every share is a copy of the secret and no randomness
 * is drawn. Otherwise `threshold - 2` shares are drawn whole from `rng`,
 * then `secret.length - 4` bytes for the digest share's tail; the remaining
 * shares are interpolated. That draw order is wire.
 *
 * @throws {ShamirError} `InvalidParameter` when `threshold` or `shareCount`
 * is not a safe non-negative integer; then `TooManyShares`,
 * `InvalidThreshold`, `SecretTooLong`, `SecretTooShort`, `SecretNotEvenLen`,
 * checked in that order.
 */
export function splitSecret(secret: Uint8Array, options: SplitOptions): ShamirShare[] {
  const { threshold, shareCount } = options;
  validate(threshold, shareCount, secret.length);

  if (threshold === 1) {
    return Array.from({ length: shareCount }, (_, index) =>
      Object.freeze({ index, data: new Uint8Array(secret) }),
    );
  }

  const rng = options.rng ?? secureRng();
  const length = secret.length;
  const points = threshold; // threshold - 2 random shares + digest + secret
  const x = new Uint8Array(points);
  const y: Uint8Array[] = Array.from({ length: points }, () => new Uint8Array(length));
  const result: Uint8Array[] = Array.from({ length: shareCount }, () => new Uint8Array(length));
  let n = 0;

  for (let index = 0; index < threshold - 2; index++) {
    rng.fillBytes(result[index]);
    x[n] = index;
    y[n].set(result[index]);
    n++;
  }

  const digest = new Uint8Array(length);
  rng.fillBytes(digest.subarray(4));
  digest.set(digestOf(digest.subarray(4), secret).subarray(0, 4), 0);
  x[n] = DIGEST_INDEX;
  y[n].set(digest);
  n++;

  x[n] = SECRET_INDEX;
  y[n].set(secret);
  n++;

  for (let index = threshold - 2; index < shareCount; index++) {
    result[index].set(interpolate(n, x, length, y, index));
  }

  memzero(digest);
  memzero(x);
  memzeroAll(y);
  return result.map((data, index) => Object.freeze({ index, data }));
}

/**
 * Recover the secret from `shares`; their count is the threshold.
 *
 * @throws {ShamirError} `InvalidThreshold` for no shares or more than
 * {@link MAX_SHARE_COUNT}, the length codes for malformed share data,
 * `SharesUnequalLength`, `InvalidParameter` for an `index` that is not an
 * integer in `[0, 255]`, and `ChecksumFailure` when the shares do not
 * belong together or have been altered. Indexes 254 and 255 and duplicates
 * are left to the checksum, as the reference leaves them.
 */
export function recoverSecret(shares: readonly ShamirShare[]): Uint8Array<ArrayBuffer> {
  const threshold = shares.length;
  if (threshold === 0) throw ShamirError.invalidThreshold();
  const first = shares[0];
  const length = first.data.length;
  validate(threshold, threshold, length);
  if (!shares.every((s) => s.data.length === length)) throw ShamirError.sharesUnequalLength();
  for (const s of shares) expectInt("index", s.index, U8);

  if (threshold === 1) return new Uint8Array(first.data);

  const x = Uint8Array.from(shares, (s) => s.index);
  const y = shares.map((s) => s.data);
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
