/**
 * @blockchaincommons/shamir - Shamir's Secret Sharing over GF(2^8) with a
 * four-byte HMAC checksum, the scheme SSKR is built on.
 *
 * {@link splitSecret} turns a 16–32 byte secret into `shareCount`
 * {@link ShamirShare}s, any `threshold` of which {@link recoverSecret}
 * turns back. Validation and checksum failures throw {@link ShamirError}.
 * Its codes include the reference's eight variants and `InvalidParameter`
 * for a `threshold`, `shareCount` or share `index` outside the supported
 * non-negative safe integer domain. RNG and other dependency failures may
 * propagate separately.
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
