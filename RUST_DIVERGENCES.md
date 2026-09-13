# Divergences from the Rust reference implementation

This library is a TypeScript port of
[`BlockchainCommons/bc-shamir-rust`](https://github.com/BlockchainCommons/bc-shamir-rust),
tracked at version **0.13.0**
([`fcf8deb`](https://github.com/BlockchainCommons/bc-shamir-rust/commit/fcf8deb2b0f51566635a7de89ae6d8d6628921c7)).

The tracked version and commit are recorded in
[`.github/versions.yml`](./.github/versions.yml), and the `upstream.yml`
workflow opens a tracking issue whenever the reference implementation moves
ahead of it.

This document is the deliberate record of every place the TypeScript behaviour
differs from the Rust reference. It has three kinds of entry:

1. **True behavioral divergences** - the same input produces a different outcome.
2. **JS-only input domain** - inputs that have no Rust analog, so there is nothing to diverge from.
3. **Mapping equivalences** - JS-specific inputs that are validated through the bytes they produce.

## 1. True behavioral divergences

- **D1 — an integer above `2⁵³ − 1`.** The reference's `usize` parameters
  (`threshold`, `share_count`, the recovery indexes) reach `2⁶⁴ − 1` on a
  64-bit target; TypeScript's `number` is exact only up to
  `Number.MAX_SAFE_INTEGER` (`2⁵³ − 1`), and the port validates all three
  parameters against that bound before anything else, rejecting the rest
  with `ShamirError` `InvalidParameter`. An integer such as `2⁵³` is
  representable but not safe, so it is a genuine difference, not a
  JS-only input. Executed side by side (fixture seed, 16-byte secret,
  3-of-5 split):

  | call | Rust (64-bit) | TypeScript |
  |---|---|---|
  | split `threshold 1, shareCount 2⁵³` | `TooManyShares` | `InvalidParameter` |
  | split `threshold 2⁵³, shareCount 1` | `InvalidThreshold` | `InvalidParameter` |
  | recover `[2⁵³, 1, 2]` (2⁵³ ≡ 0 as `u8`) | the secret | `InvalidParameter` |
  | recover `[2⁵³]` with a threshold of 1 | share 0's bytes (index unread) | `InvalidParameter` |
  | recover `[2⁵³ − 1, 1, 2]` (≡ 255 as `u8`) | `ChecksumFailure` | `ChecksumFailure` |

  A `number` above `2⁵³` may already have been rounded before the call, so
  accepting it would accept labels the caller never wrote; exact coverage
  of the reference's domain needs a `bigint` path, which is not introduced.
  The TypeScript contract is the safe-integer domain. No golden vector
  carries the divergence: the corpus stays inside the safe range.

Everything else — all 737 wire vectors, including the error variant of
every failing recipe — replays exactly against `bc-shamir 0.13.0` through
`tests/rust-validation` (`cargo run --release -- ../vectors/vectors.json`):
**748 vectors — 737 match, 11 js-only, 0 mismatch** (2026-09-12). The
harness has no divergence allowance: every input the reference can
receive must match.

## 2. JS-only input domain

Inputs the reference's `usize` parameters cannot receive. Every one is a
`ShamirError` `InvalidParameter` naming the parameter, with the message
`"<parameter> must be an integer in [<min>, <max>], got <value>"`; the Rust
harness counts their vectors as `js-only`.

- **`threshold`, `shareCount`** that are not non-negative integers (`NaN`,
  `1.5`, `Infinity`, `-1`, …). They are checked *before* the reference's
  five checks, so every integer the reference could receive (up to the
  safe-integer bound, D1) still gets the reference's code in the
  reference's order (`17` is `TooManyShares`, `0` is `InvalidThreshold`,
  `threshold 2, shareCount 1` is `InvalidThreshold`). Before this
  validation the port returned **zero shares** for `shareCount: NaN` and
  leaked a `TypeError` for fractions.
- **Share `index`** that is not a non-negative integer (`-1`, `1.5`,
  `NaN`). The index check runs *after* the reference's validators
  (`InvalidThreshold`, the secret-length codes, `SharesUnequalLength`), so
  a share set the reference rejects gets the reference's code here too.
  An integer label at or above `256` is **not** rejected: as in the
  reference (`as u8`), it is narrowed to eight bits for interpolation, so
  `256` recovers as index `0` and `65536` likewise; with a threshold of 1
  the single share is returned without reading its label at all (`[300]`
  returns the share). Executed on both sides; the golden vectors
  `labels=[256,1,2]`, `labels=[65536,1,2]` (3-of-5) and `labels=[300]`
  (1-of-3) replay identically. Indexes 254 and 255 and duplicates are *not*
  validated: the reference lets the checksum reject them, and so does the
  port (executed: `ChecksumFailure` on both sides).

## 3. Mapping equivalences

- **Zeroing on failure (an improvement, not a divergence in outcome).**
  On checksum failure the port zeroes the interpolated secret before
  throwing; the reference returns `Err` and drops the `Vec` un-zeroed.
  Both zero `digest`, `x`, `y` in split and `digest`, `verify` in recover.
  The port also zeroes its whole interpolation arena (including the
  Lagrange-basis workspace) on return, where the reference zeroes selected
  buffers; neither changes a returned byte or an error code.
- **Error shape.** `Error::X` ↔ `ShamirError` with `code: "X"`,
  `details: { code }`, `is(code)`; the reference's `Display` strings are
  the messages. All eight variants are present, including
  `InterpolationFailure` (`interpolation failed`,
  `ShamirError.interpolationFailure()`), which neither implementation
  produces from its split or recovery paths. `InvalidParameter` carries
  `details: { parameter, value }`.
- **Immutability.** The `{ index, data }` share objects `splitSecret`
  returns are frozen (the `data` buffer stays writable, as a `Vec<u8>`
  would be).
- **Constants.** `MIN_SECRET_LENGTH` / `MAX_SECRET_LENGTH` / `MAX_SHARE_COUNT`
  ↔ `MIN_SECRET_LEN` / `MAX_SECRET_LEN` / `MAX_SHARE_COUNT` (16 / 32 / 16).
- **API shape.** `split_secret(t, n, &secret, &mut rng)` ↔
  `splitSecret(secret, { threshold, shareCount, rng })`;
  `recover_secret(&indexes, &shares)` ↔ `recoverSecret(shares)` with
  `{ index, data }` objects. The harness unzips the objects. Because a
  share carries its index, the reference's `InvalidThreshold` for
  `indexes.len() != shares.len()` is unreachable by construction here.
- **Errors.** `Err(Error::ChecksumFailure)` ↔ `ShamirError` with
  `code: "ChecksumFailure"`; vectors store `throw:<variant>` and the harness
  compares `format!("{:?}", e)` to it.
- **RNG.** Rust's `&mut impl RandomNumberGenerator` ↔ `{ rng }`; the
  harness drives `bc-rand`'s `SeededRandomNumberGenerator` from the same
  xoshiro state (`fill_random_data` ↔ `fillBytes`, one 64-bit step per
  byte), and the crate tests' counter generator (0, 17, 34, …) is
  reproduced as "fake". A threshold of 1 draws nothing on either side.
  Without an `rng` the port defaults to Web Crypto; the reference requires
  a caller-provided generator.

## Maintenance

When the upstream reference moves:

1. Review the diff via the link in the `upstream.yml` tracking issue.
2. Port the relevant changes.
3. Update `.github/versions.yml` with the new version and commit.
4. Update the tracked version at the top of this file.
5. Add, amend, or remove divergence entries as the port requires.
