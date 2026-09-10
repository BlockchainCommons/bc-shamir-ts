import { RandomNumberGenerator } from "@blockchaincommons/rand";
//#region src/constants.d.ts
/**
 * Limits shared by split and recover. They are wire: SSKR shares carry
 * secrets within these bounds and nothing else.
 *
 * @module constants
 */
/** Shortest secret that can be split, in bytes. */
declare const MIN_SECRET_LENGTH = 16;
/** Longest secret that can be split, in bytes. */
declare const MAX_SECRET_LENGTH = 32;
/** Most shares a split can produce. */
declare const MAX_SHARE_COUNT = 16;
//#endregion
//#region src/error.d.ts
/**
 * The single error type thrown by this package.
 *
 * @module error
 */
/** Machine-readable discriminant for a {@link ShamirError}. */
type ShamirErrorCode = "SecretTooLong" | "TooManyShares" | "ChecksumFailure" | "SecretTooShort" | "SecretNotEvenLen" | "InvalidThreshold" | "SharesUnequalLength";
/**
 * Thrown for invalid split parameters, malformed share sets, and a failed
 * recovery checksum. Branch on `code`; messages are for humans.
 */
declare class ShamirError extends Error {
  readonly code: ShamirErrorCode;
  constructor(code: ShamirErrorCode, message?: string);
  static isShamirError(value: unknown): value is ShamirError;
  static secretTooLong(): ShamirError;
  static tooManyShares(): ShamirError;
  /** The recovered digest does not match: wrong, missing, or corrupted shares. */
  static checksumFailure(): ShamirError;
  static secretTooShort(): ShamirError;
  static secretNotEvenLen(): ShamirError;
  static invalidThreshold(): ShamirError;
  static sharesUnequalLength(): ShamirError;
}
//#endregion
//#region src/shamir.d.ts
/** One share: its x-coordinate and the y-bytes. Both are wire. */
interface ShamirShare {
  readonly index: number;
  readonly data: Uint8Array;
}
/** Options for {@link splitSecret}. */
interface SplitOptions {
  /** Shares needed to recover; `1 ≤ threshold ≤ shareCount`. */
  readonly threshold: number;
  /** Shares produced; at most {@link MAX_SHARE_COUNT}. */
  readonly shareCount: number;
  /** Generator for the random shares. Default: secure. */
  readonly rng?: RandomNumberGenerator | undefined;
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
 * @throws {ShamirError} `TooManyShares`, `InvalidThreshold`, `SecretTooLong`,
 * `SecretTooShort`, `SecretNotEvenLen`, checked in that order.
 */
declare function splitSecret(secret: Uint8Array, options: SplitOptions): ShamirShare[];
/**
 * Recover the secret from `shares`; their count is the threshold.
 *
 * @throws {ShamirError} `InvalidThreshold` for no shares or more than
 * {@link MAX_SHARE_COUNT}, the length codes for malformed share data,
 * `SharesUnequalLength`, and `ChecksumFailure` when the shares do not
 * belong together or have been altered.
 */
declare function recoverSecret(shares: readonly ShamirShare[]): Uint8Array<ArrayBuffer>;
//#endregion
export { MAX_SECRET_LENGTH, MAX_SHARE_COUNT, MIN_SECRET_LENGTH, ShamirError, type ShamirErrorCode, type ShamirShare, type SplitOptions, recoverSecret, splitSecret };
//# sourceMappingURL=index.d.mts.map