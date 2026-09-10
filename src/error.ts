/**
 * The single error type thrown by this package.
 *
 * @module error
 */

/** Machine-readable discriminant for a {@link ShamirError}. */
export type ShamirErrorCode =
  | "SecretTooLong"
  | "TooManyShares"
  | "ChecksumFailure"
  | "SecretTooShort"
  | "SecretNotEvenLen"
  | "InvalidThreshold"
  | "SharesUnequalLength";

const MESSAGES: Record<ShamirErrorCode, string> = {
  SecretTooLong: "secret is too long",
  TooManyShares: "too many shares",
  ChecksumFailure: "checksum failure",
  SecretTooShort: "secret is too short",
  SecretNotEvenLen: "secret is not of even length",
  InvalidThreshold: "invalid threshold",
  SharesUnequalLength: "shares have unequal length",
};

const captureStackTrace = (
  Error as unknown as { captureStackTrace?: (target: object, ctor: unknown) => void }
).captureStackTrace;

/**
 * Thrown for invalid split parameters, malformed share sets, and a failed
 * recovery checksum. Branch on `code`; messages are for humans.
 */
export class ShamirError extends Error {
  readonly code: ShamirErrorCode;

  constructor(code: ShamirErrorCode, message: string = MESSAGES[code]) {
    super(message);
    this.name = "ShamirError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
    if (typeof captureStackTrace === "function") captureStackTrace(this, ShamirError);
  }

  static isShamirError(value: unknown): value is ShamirError {
    return value instanceof ShamirError;
  }

  static secretTooLong(): ShamirError {
    return new ShamirError("SecretTooLong");
  }
  static tooManyShares(): ShamirError {
    return new ShamirError("TooManyShares");
  }
  /** The recovered digest does not match: wrong, missing, or corrupted shares. */
  static checksumFailure(): ShamirError {
    return new ShamirError("ChecksumFailure");
  }
  static secretTooShort(): ShamirError {
    return new ShamirError("SecretTooShort");
  }
  static secretNotEvenLen(): ShamirError {
    return new ShamirError("SecretNotEvenLen");
  }
  static invalidThreshold(): ShamirError {
    return new ShamirError("InvalidThreshold");
  }
  static sharesUnequalLength(): ShamirError {
    return new ShamirError("SharesUnequalLength");
  }
}
