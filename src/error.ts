/**
 * The single error type thrown by this package.
 *
 * @module error
 */

/**
 * Machine-readable discriminant for a {@link ShamirError}. Eight codes are
 * the reference's variant names; `InvalidParameter` is JS-only.
 */
export type ShamirErrorCode =
  | "SecretTooLong"
  | "TooManyShares"
  | "InterpolationFailure"
  | "ChecksumFailure"
  | "SecretTooShort"
  | "SecretNotEvenLen"
  | "InvalidThreshold"
  | "SharesUnequalLength"
  | "InvalidParameter";

/** The argument an `InvalidParameter` error names. */
export type ShamirParameter = "threshold" | "shareCount" | "index";

/**
 * The structured payload of a {@link ShamirError}, discriminated by `code`.
 * Only `InvalidParameter` carries data: `e.details.code === "InvalidParameter"`
 * narrows to `{ parameter, value }`.
 */
export type ShamirErrorDetails =
  | {
      /** One of the reference's eight codes; no payload. */
      readonly code: Exclude<ShamirErrorCode, "InvalidParameter">;
    }
  | {
      /** A `number` argument outside the supported non-negative safe integer domain. */
      readonly code: "InvalidParameter";
      /** The argument. */
      readonly parameter: ShamirParameter;
      /** The value received. */
      readonly value: number;
    };

const MESSAGES: Record<Exclude<ShamirErrorCode, "InvalidParameter">, string> = {
  SecretTooLong: "secret is too long",
  TooManyShares: "too many shares",
  InterpolationFailure: "interpolation failed",
  ChecksumFailure: "checksum failure",
  SecretTooShort: "secret is too short",
  SecretNotEvenLen: "secret is not of even length",
  InvalidThreshold: "invalid threshold",
  SharesUnequalLength: "shares have unequal length",
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
export class ShamirError extends Error {
  /** Always `"ShamirError"`; the cross-copy identity {@link ShamirError.isShamirError} checks. */
  override readonly name = "ShamirError";
  /** The discriminant; equals `details.code`. */
  readonly code: ShamirErrorCode;
  /** The structured payload, discriminated by `code`. */
  readonly details: ShamirErrorDetails;

  private constructor(message: string, details: ShamirErrorDetails) {
    super(message);
    this.code = details.code;
    this.details = details;
  }

  /** Type guard for a `ShamirError`, including one from another copy of this package. */
  static isShamirError(value: unknown): value is ShamirError {
    return value instanceof Error && value.name === "ShamirError" && "code" in value;
  }

  /** `true` when `code` is this error's code. */
  is(code: ShamirErrorCode): boolean {
    return this.code === code;
  }

  /** The secret is longer than `MAX_SECRET_LENGTH`. */
  static secretTooLong(): ShamirError {
    return new ShamirError(MESSAGES.SecretTooLong, { code: "SecretTooLong" });
  }
  /** `shareCount` is above `MAX_SHARE_COUNT`. */
  static tooManyShares(): ShamirError {
    return new ShamirError(MESSAGES.TooManyShares, { code: "TooManyShares" });
  }
  /** Rust compatibility variant; current split and recovery paths do not produce it. */
  static interpolationFailure(): ShamirError {
    return new ShamirError(MESSAGES.InterpolationFailure, { code: "InterpolationFailure" });
  }
  /** The recovered digest does not match: wrong, missing, or corrupted shares. */
  static checksumFailure(): ShamirError {
    return new ShamirError(MESSAGES.ChecksumFailure, { code: "ChecksumFailure" });
  }
  /** The secret is shorter than `MIN_SECRET_LENGTH`. */
  static secretTooShort(): ShamirError {
    return new ShamirError(MESSAGES.SecretTooShort, { code: "SecretTooShort" });
  }
  /** The secret has an odd number of bytes. */
  static secretNotEvenLen(): ShamirError {
    return new ShamirError(MESSAGES.SecretNotEvenLen, { code: "SecretNotEvenLen" });
  }
  /** `threshold` is below 1 or above `shareCount` (or, on recovery, no shares). */
  static invalidThreshold(): ShamirError {
    return new ShamirError(MESSAGES.InvalidThreshold, { code: "InvalidThreshold" });
  }
  /** Not every share has the same length. */
  static sharesUnequalLength(): ShamirError {
    return new ShamirError(MESSAGES.SharesUnequalLength, { code: "SharesUnequalLength" });
  }
  /** `parameter` is not an integer in `[min, max]`; `value` is what was received. */
  static invalidParameter(
    parameter: ShamirParameter,
    value: number,
    bounds: { readonly min: number; readonly max: number },
  ): ShamirError {
    return new ShamirError(
      `${parameter} must be an integer in [${bounds.min}, ${bounds.max}], got ${String(value)}`,
      { code: "InvalidParameter", parameter, value },
    );
  }
}
