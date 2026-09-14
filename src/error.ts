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

/**
 * The argument an `InvalidParameter` error names: an integer parameter that
 * is not a `usize`, or an argument of the wrong type (`options` and `share`
 * must be objects, `secret` and `data` `Uint8Array`s, `shares` an array).
 */
export type ShamirParameter =
  "threshold" | "shareCount" | "index" | "options" | "secret" | "shares" | "share" | "data";

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
      /** An argument outside its domain: an integer that is not a `usize`, or a value of the wrong type. */
      readonly code: "InvalidParameter";
      /** The argument. */
      readonly parameter: ShamirParameter;
      /** The value received, as passed. */
      readonly value: unknown;
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

/** What an integer parameter must be: the `usize` domain in its two TypeScript forms. */
const USIZE_DOMAIN = "an integer in [0, 9007199254740991] or a bigint in [0, 18446744073709551615]";

/** What each parameter must be. */
const EXPECTATIONS: Record<ShamirParameter, string> = {
  threshold: USIZE_DOMAIN,
  shareCount: USIZE_DOMAIN,
  index: USIZE_DOMAIN,
  options: "an object",
  share: "an object",
  secret: "a Uint8Array",
  data: "a Uint8Array",
  shares: "an array",
};

/**
 * The received value, rendered exactly: a `bigint` with its `n` suffix, an
 * unsafe integer `number` by its exact digits (`String` would round them),
 * a string quoted, and objects by their constructor name.
 */
function render(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "number") {
    return Number.isInteger(value) && !Number.isSafeInteger(value)
      ? BigInt(value).toString()
      : String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "function") return "function";
  if (Array.isArray(value)) return "Array";
  if (typeof value === "object" && value !== null) {
    const ctor = (value as { constructor?: { name?: unknown } }).constructor;
    return typeof ctor?.name === "string" && ctor.name !== "" ? ctor.name : "object";
  }
  return String(value);
}

/**
 * Thrown for invalid split parameters, malformed share sets, a failed
 * recovery checksum, and (JS-only) an argument outside its domain: a
 * `threshold`, `shareCount` or share `index` that is not a `usize`, or an
 * argument of the wrong type. Branch on `code`; messages are the
 * reference's strings.
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
  /**
   * `parameter` is outside its domain: an integer parameter that is not a
   * `usize` (neither a safe non-negative integer `number` nor a `bigint` in
   * `[0, 2^64 - 1]`), or an argument of the wrong type. `value` is what was
   * received; the message renders it exactly.
   */
  static invalidParameter(parameter: ShamirParameter, value: unknown): ShamirError {
    return new ShamirError(
      `${parameter} must be ${EXPECTATIONS[parameter]}, got ${render(value)}`,
      { code: "InvalidParameter", parameter, value },
    );
  }
}
