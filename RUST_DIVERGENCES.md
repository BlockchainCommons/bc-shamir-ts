# Divergences from the Rust reference implementation

This library is a TypeScript port of
[`BlockchainCommons/bc-shamir-rust`](https://github.com/BlockchainCommons/bc-shamir-rust),
tracked at version **0.13.0**
([`fcf8deb`](https://github.com/BlockchainCommons/bc-shamir-rust/commit/fcf8deb2b0f51566635a7de89ae6d8d6628921c7)),
built on `bc-rand` 0.5.0 and compared on a 64-bit target (a `usize` reaches
`2⁶⁴ − 1`; the Rust harness asserts it).

The tracked version and commit are recorded in
[`.github/versions.yml`](./.github/versions.yml), and the `upstream.yml`
workflow opens a tracking issue whenever the reference implementation moves
ahead of it.

This document records every place where the same input produces a different
outcome in TypeScript and in the reference.

## Behavioral divergences

None. For every input the reference can receive, the port returns the same
shares or secret, drawn from the same random stream, or fails with the same
error variant.

The Rust harness (`tests/rust-validation`) replays every vector the reference
can execute, in CI, on the golden file and on the full corpus:
**`783 vectors - 762 match, 21 js-only, 0 MISMATCH`** and
**`5271 vectors - 5250 match, 21 js-only, 0 MISMATCH`**. It has no
divergence allowance, and a committed one-vector fixture
(`tests/rust-validation/mismatch.json`) proves it fails on a single wrong
nibble. The vectors it does not compare (`js-only`) are inputs the
reference's types cannot receive, which have no reference outcome to
diverge from. How the port treats those inputs, and how Rust names, integer
types, error variants and the random stream map to TypeScript, is documented
in the API reference and in [`MIGRATION.md`](./MIGRATION.md).

## Maintenance

When the upstream reference moves:

1. Review the diff via the link in the `upstream.yml` tracking issue.
2. Port the relevant changes.
3. Update `.github/versions.yml` with the new version and commit, and the
   tracked version at the top of this file.
4. Run `bun run vectors:generate` and review the diff. Run the harness on the
   golden file and on `bun run vectors:full`; both must report `0 MISMATCH`.
5. Keep the result lines equal to CI's. Every new difference is a bug on one
   side: record it here until it is fixed.
