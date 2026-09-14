# Changelog

## Unreleased

Closes the remaining divergence from the reference, `bc-shamir` 0.13.0, and
validates the JavaScript-only argument domain.

### Changed (breaking)

- **`ShamirError.invalidParameter(parameter, value)`** loses its `bounds`
  argument, and `details.value` is `unknown` instead of `number`. The message
  for an integer parameter is now `"<parameter> must be an integer in
  [0, 9007199254740991] or a bigint in [0, 18446744073709551615], got <value>"`,
  with the received value rendered exactly (an unsafe integer by its digits,
  a `bigint` with its `n` suffix, a string quoted, an object by its
  constructor name).
- **Every argument is type-checked before anything else.** An `options` that
  is not an object, a `secret` or share `data` that is not a `Uint8Array`, a
  `shares` that is not an array, or a share that is not an object throws
  `InvalidParameter` naming it (`ShamirParameter` gains `"options"`,
  `"secret"`, `"shares"`, `"share"` and `"data"`), identically for every
  threshold. Before, a string secret or `number[]` data was accepted at
  threshold 1 (returning empty or unchecked shares) and leaked a `TypeError`
  otherwise. A `Buffer` and a `Uint8Array` from another realm are accepted.
- **Randomness is drawn through `@blockchaincommons/rand`'s
  `fillRandomBytes`**, so rand's generator contract applies: a generator
  without a callable `fillBytes` now throws rand's `RandError`
  `InvalidGenerator` at the first draw instead of an engine `TypeError`. A
  generator's own error still propagates unwrapped, and a threshold of 1
  never touches the generator.

### Added

- **`bigint` inputs.** `threshold`, `shareCount` and a share's `index` accept
  a `bigint` in `[0, 2^64 − 1]` as well as a safe-integer `number`, which
  covers the reference's whole `usize` domain exactly: split compares the
  value exactly (`2n ** 53n` shares is `TooManyShares`), recovery narrows it
  to eight bits as the reference's `as u8` does (`256n` is index `0`,
  `2n ** 64n - 1n` is `255`). A `number` above `Number.MAX_SAFE_INTEGER`
  stays `InvalidParameter`, because such a double stands for several
  integers; the message names the `bigint` form.
- **`ShamirShareInput`**, the `{ index: number | bigint; data }` shape
  `recoverSecret` takes. `ShamirShare` (what `splitSecret` returns, with a
  `number` index) extends it, so existing callers are unchanged.
- Each share's `index` and `data` are read once, before any check, and the
  secret's length once; validation and interpolation see the same values.

### Validation

- The Rust harness classifies every recipe integer instead of casting it: a
  JSON number is compared only up to `2^53 − 1`, a `"<digits>n"` string is
  compared as an exact `u64`, anything else is js-only or `unparsable` (a
  failure, never a panic); it asserts a 64-bit `usize` and never unwraps a
  vector field outside a vector. `bun run vectors:full` materialises the
  whole corpus, and a committed `mismatch.json` proves a single flipped
  nibble fails the run.
- 35 new golden vectors: 25 for the integer domain (`bigint` split
  parameters and labels up to `2^64 − 1`, unsafe numbers) and 10 for labels
  254, 255 and 511 and for two consecutive splits from one generator.
  Results: `783 vectors - 762 match, 21 js-only, 0 MISMATCH`; full corpus
  `5271 vectors - 5250 match, 21 js-only, 0 MISMATCH`.
- CI gains a `rust-validation` job that replays the golden file and the full
  corpus against the pinned crates and checks the mismatch fixture.
- Tests: exact-rendering rows for the `InvalidParameter` message, `bigint`
  split and recovery rows mirroring the reference, argument-type rows and
  properties (`fc.anything()` for every argument at thresholds 1 and 3),
  getter spies proving single reads, and the generator contract
  (`RandError` `InvalidGenerator`, unwrapped propagation, untouched at
  threshold 1).

## 1.0.0-beta.2 - 2026-09-12

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

## 1.0.0-beta.1 - 2026-09-09

Initial beta implementation.
