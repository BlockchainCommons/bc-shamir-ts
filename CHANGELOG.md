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

## 1.0.0-beta.1

Initial beta implementation.
