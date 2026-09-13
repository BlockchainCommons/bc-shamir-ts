# Changelog

## 1.0.0-beta.2

Rust compatibility, documentation, test, and release-tooling updates.

### Changed

- Recovery accepts non-negative safe integer indexes above 255, truncating them
  to eight bits for interpolation, as Rust does. Single-share recovery accepts
  any supported index. Negative, fractional, non-finite, and unsafe integer
  indexes still throw `InvalidParameter`.
- Restore the `InterpolationFailure` error code and `ShamirError.interpolationFailure()`
  factory with Rust's message. Current split and recovery paths do not produce it.
  Consumers with exhaustive error handling must include the restored code.
- Close the oversized-safe-index recovery divergence and remove its Rust harness allowance.
  Cross-validation: 748 vectors, 737 matches, 11 JavaScript-only inputs, zero mismatches.

### Documentation

- Record the retained safe-integer input contract, including the `2^53`
  differences from 64-bit Rust, and the retained memory-clearing and API choices.
- Align README, migration, security-review, and verification guides with the
  current behavior. Document the baseline's 11 JavaScript-domain exceptions
  separately from Rust cross-validation.

## 1.0.0-beta.1

Initial beta implementation.
