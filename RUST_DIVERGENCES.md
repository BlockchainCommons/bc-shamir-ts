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

- **D1 — a share index outside `u8`.** `recover_secret` takes `usize`
  indexes. When the threshold is 2 or more it narrows them with `as u8`,
  so `256` recovers as index `0` and `65536` likewise; when the threshold
  is 1 it returns the single share **without reading the indexes at all**,
  so any label is accepted. TypeScript validates every `index` as an
  integer in `[0, 255]` before either path and rejects the rest with
  `ShamirError` `InvalidParameter`. Executed side by side (fixture seed,
  16-byte secret, 3-of-5 split):

  | call | Rust | TypeScript |
  |---|---|---|
  | recover `[256, 1, 2]` (256 ≡ 0 as `u8`) | the secret | `InvalidParameter` |
  | recover `[300]` with a threshold of 1 | share 0's bytes (index unread) | `InvalidParameter` |
  | recover `[0, 1, 2]` | the secret | the secret |
  | recover `[254, 1, 2]`, `[255, 1, 2]`, `[0, 0, 2]` | `ChecksumFailure` | `ChecksumFailure` |

  A wire index is a `u8` (SSKR's member index is four bits), and `256`
  silently aliasing `0` means a caller's bookkeeping error "recovers"
  with the wrong share identity — the class of fault the check exists to
  catch. The TypeScript contract is the `u8` domain. Three golden vectors
  carry the divergence (`labels=[256,1,2]`, `labels=[65536,1,2]` on a
  3-of-5 recover; `labels=[300]` on a 1-of-3 recover) and the harness
  allowlists them as D1. **Upstream fix:** `recover_secret(&[u8], …)`, or
  a bounds check before the narrowing.

Everything else — all 735 wire vectors, including the error variant of
every failing recipe — replays exactly against `bc-shamir 0.13.0` through
`tests/rust-validation` (`cargo run --release -- ../vectors/vectors.json`):
**748 vectors — 734 match, 3 expected divergence (D1), 11 js-only, 0
mismatch** (2026-09-12).

## 2. JS-only input domain

Inputs the reference's `usize`/`u8` parameters cannot receive. Every one
is a `ShamirError` `InvalidParameter` naming the parameter, with the
message `"<parameter> must be an integer in [<min>, <max>], got <value>"`;
the Rust harness counts their vectors as `js-only`.

- **`threshold`, `shareCount`** that are not safe non-negative integers
  (`NaN`, `1.5`, `Infinity`, `-1`, …). They are checked *before* the
  reference's five checks, so every integer the reference could receive
  still gets the reference's code in the reference's order (`17` is
  `TooManyShares`, `0` is `InvalidThreshold`, `threshold 2, shareCount 1`
  is `InvalidThreshold`). Before this validation the port returned **zero
  shares** for `shareCount: NaN` and leaked a `TypeError` for fractions.
- **Share `index`** that is not an integer in `[0, 255]` (`-1`, `1.5`,
  `NaN`; `≥ 256` is D1 above). The index check runs *after* the
  reference's validators (`InvalidThreshold`, the secret-length codes,
  `SharesUnequalLength`), so a share set the reference rejects gets the
  reference's code here too. Indexes 254 and 255 and duplicates are *not*
  validated: the reference lets the checksum reject them, and so does the
  port (executed: `ChecksumFailure` on both sides).
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

## Maintenance

When the upstream reference moves:

1. Review the diff via the link in the `upstream.yml` tracking issue.
2. Port the relevant changes.
3. Update `.github/versions.yml` with the new version and commit.
4. Update the tracked version at the top of this file.
5. Add, amend, or remove divergence entries as the port requires.
