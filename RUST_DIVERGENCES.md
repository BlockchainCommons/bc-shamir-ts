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

_None._ All 734 golden vectors (`tests/vectors/vectors.json`), including
the error variant of every failing recipe, replay exactly against
`bc-shamir 0.13.0` through `tests/rust-validation`
(`cargo run --release -- ../vectors/vectors.json`).

## 2. JS-only input domain

- **Share indexes.** Rust takes `usize` indexes and narrows them to `u8`;
  TypeScript takes `number` and narrows the same way through
  `Uint8Array.from`. Neither validates the range; an index ≥ 254 collides
  with the digest/secret x-coordinates in both.
- **`InterpolationFailure`.** Rust's `Error` enum keeps the variant;
  neither implementation can produce it. Dropped from the TypeScript code
  union (surface-only difference).

## 3. Mapping equivalences

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
