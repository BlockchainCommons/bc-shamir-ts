/**
 * @blockchaincommons/shamir - Shamir's Secret Sharing over GF(2^8) with a
 * four-byte HMAC checksum, the scheme SSKR is built on.
 *
 * {@link splitSecret} turns a 16–32 byte secret into `shareCount`
 * {@link ShamirShare}s, any `threshold` of which {@link recoverSecret}
 * turns back. Validation and checksum failures throw {@link ShamirError}.
 * Its codes include the reference's eight variants and `InvalidParameter`
 * for a `threshold`, `shareCount` or share `index` that is not a `usize`
 * (a safe non-negative integer `number`, or a `bigint` in `[0, 2^64 - 1]`)
 * and for an argument of the wrong type. Randomness is drawn through
 * `@blockchaincommons/rand`, so a generator's own error, including rand's
 * `RandError` for a malformed generator, propagates unwrapped.
 *
 * @module @blockchaincommons/shamir
 */
export { MIN_SECRET_LENGTH, MAX_SECRET_LENGTH, MAX_SHARE_COUNT } from "./constants.js";
export {
  ShamirError,
  type ShamirErrorCode,
  type ShamirErrorDetails,
  type ShamirParameter,
} from "./error.js";
export {
  splitSecret,
  recoverSecret,
  type ShamirShare,
  type ShamirShareInput,
  type SplitOptions,
} from "./shamir.js";
