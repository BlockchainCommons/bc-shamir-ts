/**
 * @blockchaincommons/shamir - Shamir's Secret Sharing over GF(2^8) with a
 * four-byte HMAC checksum, the scheme SSKR is built on.
 *
 * {@link splitSecret} turns a 16–32 byte secret into `shareCount`
 * {@link ShamirShare}s, any `threshold` of which {@link recoverSecret}
 * turns back. Every failure is a {@link ShamirError} with a `code`: the
 * reference's seven, plus `InvalidParameter` for a `threshold`, `shareCount`
 * or share `index` outside the integer domain the reference's type implies.
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
export { splitSecret, recoverSecret, type ShamirShare, type SplitOptions } from "./shamir.js";
