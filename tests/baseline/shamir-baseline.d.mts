import { RandomNumberGenerator } from "@blockchaincommons/rand";
//#region src/error.d.ts
/**
 * Copyright © 2023-2026 Blockchain Commons, LLC
 *
 */
/**
 * Error types for Shamir secret sharing operations.
 *
 * Each variant mirrors a corresponding `Error::*` enum in
 * `bc-shamir-rust/src/error.rs` with the same trigger conditions and the
 * same default `Display` strings.
 *
 * Note on `InterpolationFailure`: this variant is **reserved but
 * unreachable** in both the Rust and TypeScript implementations.
 * `interpolate()` in `interpolate.ts` never actually returns / throws an
 * interpolation failure today — the Lagrange-basis math always succeeds
 * for any well-formed input. The variant is kept for forward
 * compatibility (e.g. should a future revision add input validation that
 * could reject pathological cases) and to keep the TS error type a 1:1
 * mirror of Rust's `Error` enum.
 */
declare enum ShamirErrorType {
  SecretTooLong = "SecretTooLong",
  TooManyShares = "TooManyShares",
  /**
   * Reserved / unreachable in both Rust and TS today. See enum doc above.
   */
  InterpolationFailure = "InterpolationFailure",
  ChecksumFailure = "ChecksumFailure",
  SecretTooShort = "SecretTooShort",
  SecretNotEvenLen = "SecretNotEvenLen",
  InvalidThreshold = "InvalidThreshold",
  SharesUnequalLength = "SharesUnequalLength"
}
/**
 * Error class for Shamir secret sharing operations.
 */
declare class ShamirError extends Error {
  readonly type: ShamirErrorType;
  constructor(type: ShamirErrorType, message?: string);
  private static defaultMessage;
}
/**
 * Mirrors Rust's `Result<T, Error>` for API parity.
 *
 * The TypeScript port surfaces failures by throwing `ShamirError`
 * instances rather than returning a sum type, so this alias is a no-op
 * (`ShamirResult<T>` ≡ `T`). It is kept so signatures published in
 * `@blockchaincommons/shamir` remain visually parallel to their Rust counterparts.
 */
type ShamirResult<T> = T;
//#endregion
//#region src/shamir.d.ts
/**
 * Splits a secret into shares using the Shamir secret sharing algorithm.
 *
 * @param threshold - The minimum number of shares required to reconstruct the
 *   secret. Must be greater than or equal to 1 and less than or equal to
 *   shareCount.
 * @param shareCount - The total number of shares to generate. Must be at least
 *   threshold and less than or equal to MAX_SHARE_COUNT.
 * @param secret - A Uint8Array containing the secret to be split. Must be at
 *   least MIN_SECRET_LEN bytes long and at most MAX_SECRET_LEN bytes long.
 *   The length must be an even number.
 * @param randomGenerator - An implementation of the RandomNumberGenerator
 *   interface, used to generate random data.
 * @returns An array of Uint8Array representing the shares of the secret.
 * @throws ShamirError if parameters are invalid
 *
 * @example
 * ```typescript
 * import { splitSecret } from "@blockchaincommons/shamir";
 * import { SecureRandomNumberGenerator } from "@blockchaincommons/rand";
 *
 * const threshold = 2;
 * const shareCount = 3;
 * const secret = new TextEncoder().encode("my secret belongs to me.");
 * const rng = new SecureRandomNumberGenerator();
 *
 * const shares = splitSecret(threshold, shareCount, secret, rng);
 * console.log(shares.length); // 3
 * ```
 */
declare function splitSecret(threshold: number, shareCount: number, secret: Uint8Array, randomGenerator: RandomNumberGenerator): Uint8Array[];
/**
 * Recovers the secret from the given shares using the Shamir secret sharing
 * algorithm.
 *
 * @param indexes - An array of indexes of the shares to be used for recovering
 *   the secret. These are the indexes of the shares returned by splitSecret.
 * @param shares - An array of shares of the secret matching the indexes in
 *   indexes. These are the shares returned by splitSecret.
 * @returns A Uint8Array representing the recovered secret.
 * @throws ShamirError if parameters are invalid or checksum verification fails
 *
 * @example
 * ```typescript
 * import { recoverSecret } from "@blockchaincommons/shamir";
 *
 * const indexes = [0, 2];
 * const shares = [
 *   new Uint8Array([47, 165, 102, 232, ...]),
 *   new Uint8Array([221, 174, 116, 201, ...]),
 * ];
 *
 * const secret = recoverSecret(indexes, shares);
 * console.log(new TextDecoder().decode(secret)); // "my secret belongs to me."
 * ```
 */
declare function recoverSecret(indexes: number[], shares: Uint8Array[]): Uint8Array;
//#endregion
//#region src/index.d.ts
/**
 * Copyright © 2023-2026 Blockchain Commons, LLC
 *
 */
/**
 * The minimum length of a secret.
 */
declare const MIN_SECRET_LEN = 16;
/**
 * The maximum length of a secret.
 */
declare const MAX_SECRET_LEN = 32;
/**
 * The maximum number of shares that can be generated from a secret.
 */
declare const MAX_SHARE_COUNT = 16;
//#endregion
export { MAX_SECRET_LEN, MAX_SHARE_COUNT, MIN_SECRET_LEN, ShamirError, ShamirErrorType, type ShamirResult, recoverSecret, splitSecret };
//# sourceMappingURL=index.d.mts.map