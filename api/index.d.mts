import { RngOptions } from "@blockchaincommons/rand";
//#region src/constants.d.ts
/**
 * Limits shared by split and recover. They are wire: SSKR shares carry
 * secrets within these bounds and nothing else.
 *
 * @module constants
 */
/** Shortest secret that can be split, in bytes. */
export declare const MIN_SECRET_LENGTH = 16;
/** Longest secret that can be split, in bytes. */
export declare const MAX_SECRET_LENGTH = 32;
/** Most shares a split can produce. */
export declare const MAX_SHARE_COUNT = 16;
//#endregion
//#region src/error.d.ts
/**
 * The single error type thrown by this package.
 *
 * @module error
 */
/**
 * Machine-readable discriminant for a {@link ShamirError}. Eight codes are
 * the reference's variant names; `InvalidParameter` is JS-only.
 */
type ShamirErrorCode = "SecretTooLong" | "TooManyShares" | "InterpolationFailure" | "ChecksumFailure" | "SecretTooShort" | "SecretNotEvenLen" | "InvalidThreshold" | "SharesUnequalLength" | "InvalidParameter";
/** The argument an `InvalidParameter` error names. */
type ShamirParameter = "threshold" | "shareCount" | "index";
/**
 * The structured payload of a {@link ShamirError}, discriminated by `code`.
 * Only `InvalidParameter` carries data: `e.details.code === "InvalidParameter"`
 * narrows to `{ parameter, value }`.
 */
type ShamirErrorDetails = {
  /** One of the reference's eight codes; no payload. */
  readonly code: Exclude<ShamirErrorCode, "InvalidParameter">;
} | {
  /** A `number` argument outside the supported non-negative safe integer domain. */
  readonly code: "InvalidParameter";
  /** The argument. */
  readonly parameter: ShamirParameter;
  /** The value received. */
  readonly value: number;
};
/**
 * Thrown for invalid split parameters, malformed share sets, a failed
 * recovery checksum, and (JS-only) a `threshold`, `shareCount` or share
 * `index` that is not an integer in its domain. Branch on `code`; messages
 * are the reference's strings.
 *
 * Instances come from the static factories only.
 *
 * @example
 * ```ts
 * try {
 *   recoverSecret(shares);
 * } catch (e) {
 *   if (ShamirError.isShamirError(e) && e.is("ChecksumFailure")) {
 *     // wrong, missing or altered shares
 *   }
 * }
 * ```
 */
export declare class ShamirError extends Error {
  /** Always `"ShamirError"`; the cross-copy identity {@link ShamirError.isShamirError} checks. */
  override readonly name = "ShamirError";
  /** The discriminant; equals `details.code`. */
  readonly code: ShamirErrorCode;
  /** The structured payload, discriminated by `code`. */
  readonly details: ShamirErrorDetails;
  private constructor();
  /** Type guard for a `ShamirError`, including one from another copy of this package. */
  static isShamirError(value: unknown): value is ShamirError;
  /** `true` when `code` is this error's code. */
  is(code: ShamirErrorCode): boolean;
  /** The secret is longer than `MAX_SECRET_LENGTH`. */
  static secretTooLong(): ShamirError;
  /** `shareCount` is above `MAX_SHARE_COUNT`. */
  static tooManyShares(): ShamirError;
  /** Rust compatibility variant; current split and recovery paths do not produce it. */
  static interpolationFailure(): ShamirError;
  /** The recovered digest does not match: wrong, missing, or corrupted shares. */
  static checksumFailure(): ShamirError;
  /** The secret is shorter than `MIN_SECRET_LENGTH`. */
  static secretTooShort(): ShamirError;
  /** The secret has an odd number of bytes. */
  static secretNotEvenLen(): ShamirError;
  /** `threshold` is below 1 or above `shareCount` (or, on recovery, no shares). */
  static invalidThreshold(): ShamirError;
  /** Not every share has the same length. */
  static sharesUnequalLength(): ShamirError;
  /** `parameter` is not an integer in `[min, max]`; `value` is what was received. */
  static invalidParameter(parameter: ShamirParameter, value: number, bounds: {
    readonly min: number;
    readonly max: number;
  }): ShamirError;
}
//#endregion
//#region src/shamir.d.ts
/**
 * One share: its x-coordinate and the y-bytes. Both are wire. The objects
 * {@link splitSecret} returns are frozen; `data` is a fresh buffer that may
 * be a view when the share comes from elsewhere.
 */
interface ShamirShare {
  /** The x-coordinate, a non-negative safe integer, truncated to eight bits during recovery; `splitSecret` assigns `0..shareCount-1`. */
  readonly index: number;
  /** The y-bytes; every share of one split has the secret's length. */
  readonly data: Uint8Array;
}
/** Options for {@link splitSecret}; `rng` is rand's option, secure by default. */
interface SplitOptions extends RngOptions {
  /** Shares needed to recover; `1 ≤ threshold ≤ shareCount`. */
  readonly threshold: number;
  /** Shares produced; at most {@link MAX_SHARE_COUNT}. */
  readonly shareCount: number;
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
export declare function splitSecret(secret: Uint8Array, options: SplitOptions): ShamirShare[];
/**
 * Recover the secret from `shares`; their count is the threshold.
 *
 * @throws {ShamirError} `InvalidThreshold` for no shares, `TooManyShares` above
 * {@link MAX_SHARE_COUNT}, the length codes for malformed share data,
 * `SharesUnequalLength`, `InvalidParameter` for an `index` that is not a
 * non-negative safe integer, and `ChecksumFailure` when the shares do not
 * belong together or have been altered. Indexes 254 and 255 and duplicates
 * are left to the checksum, as the reference leaves them.
 */
export declare function recoverSecret(shares: readonly ShamirShare[]): Uint8Array<ArrayBuffer>;
//#endregion
export type { ShamirErrorCode, ShamirErrorDetails, ShamirParameter, ShamirShare, SplitOptions };
//# sourceMappingURL=index.d.mts.map