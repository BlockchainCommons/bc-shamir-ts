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

- **D1 — a share index ≥ 256.** Rust takes `usize` indexes and narrows
  them with `as u8`, so `256` recovers as index `0` and `65536` likewise;
  TypeScript rejects any `index` that is not an integer in `[0, 255]` with
  `ShamirError` `InvalidParameter`. Truncating a wire index is not a
  specification; the TypeScript contract is the `u8` domain. Two golden
  vectors (`labels=[256,1,2]`, `labels=[65536,1,2]`) carry the divergence
  and the harness allowlists them as D1.

Everything else — all 734 wire vectors, including the error variant of
every failing recipe — replays exactly against `bc-shamir 0.13.0` through
`tests/rust-validation` (`cargo run --release -- ../vectors/vectors.json`):
**747 vectors — 734 match, 2 expected divergence (D1), 11 js-only, 0
mismatch** (2026-09-11).

## 2. JS-only input domain

Inputs the reference's `usize`/`u8` parameters cannot receive. Every one
is a `ShamirError` `InvalidParameter` naming the parameter, with the
message `"<parameter> must be an integer in [<min>, <max>], got <value>"`;
the Rust harness counts their vectors as `js-only`.

- **`threshold`, `shareCount`** that are not safe non-negative integers
  (`NaN`, `1.5`, `Infinity`, `-1`, …). They are checked *before* the
  reference's five checks, so every integer the reference could receive
  still gets the reference's code in the reference's order (`17` is
  `TooManyShares`, `0` is `InvalidThreshold`). Before this validation the
  port returned **zero shares** for `shareCount: NaN` and leaked a
  `TypeError` for fractions.
- **Share `index`** that is not an integer in `[0, 255]` (`-1`, `1.5`,
  `NaN`; `≥ 256` is D1 above). Indexes 254 and 255 and duplicates are
  *not* validated: the reference lets the checksum reject them, and so
  does the port.
- **`InterpolationFailure`.** Rust's `Error` enum keeps the variant;
  neither implementation can produce it. Dropped from the TypeScript code
  union (surface-only difference).

## 3. Mapping equivalences

- **Zeroing on failure (an improvement, not a divergence in outcome).**
  On checksum failure the port zeroes the interpolated secret before
  throwing; the reference returns `Err` and drops the `Vec` un-zeroed.
  Both zero `digest`, `x`, `y` in split and `digest`, `verify` in recover.
- **Error shape.** `Error::X` ↔ `ShamirError` with `code: "X"`,
  `details: { code }`, `is(code)`; the reference's `Display` strings are
  the messages. `InvalidParameter` carries `details: { parameter, value }`.
- **Immutability.** The `{ index, data }` share objects `splitSecret`
  returns are frozen (the `data` buffer stays writable, as a `Vec<u8>`
  would be).

- **API shape.** `split_secret(t, n, &secret, &mut rng)` ↔
  `splitSecret(secret, { threshold, shareCount, rng })`;
  `recover_secret(&indexes, &shares)` ↔ `recoverSecret(shares)` with
  `{ index, data }` objects. The harness unzips the objects.
- **Errors.** `Err(Error::ChecksumFailure)` ↔ `ShamirError` with
  `code: "ChecksumFailure"`; vectors store `throw:<variant>` and the harness
  compares `format!("{:?}", e)` to it.
- **RNG.** Rust's `&mut impl RandomNumberGenerator` ↔ `{ rng }`; the
  harness drives `bc-rand`'s `SeededRandomNumberGenerator` from the same
  xoshiro state, and the crate tests' counter generator (0, 17, 34, …) is
  reproduced as "fake".

## Maintenance

When the upstream reference moves:

1. Review the diff via the link in the `upstream.yml` tracking issue.
2. Port the relevant changes.
3. Update `.github/versions.yml` with the new version and commit.
4. Update the tracked version at the top of this file.
5. Add, amend, or remove divergence entries as the port requires.
