# Frozen baseline build

`shamir-baseline.mjs` is the self-contained ESM bundle of `@blockchaincommons/shamir` built from
commit `c45f44d1aedbd5da06c4e0fd0b553d8ece2b904b`, the `@bcts/shamir` wire-format reference. The
sibling `@blockchaincommons/crypto` is bundled from its own frozen baseline bundle, so this
bundle keeps the behaviour that dependency had at that commit. That shamir API took an
external RNG object rather than importing `@blockchaincommons/rand` directly, so
`rand-baseline.mjs` / `rand-baseline.d.mts` (a vendored copy of `@blockchaincommons/rand`'s
own frozen baseline) are here to construct one for the tests. `shamir-baseline.d.mts` is the
public surface at that commit.

`tests/differential.test.ts` runs every corpus recipe through this bundle and
the working tree. Outcomes must match except for the allowed differences it
lists with their hit counts: the 17 `domain` recipes whose `threshold`,
`shareCount` or index label is not a usize, where the working tree throws
`InvalidParameter` and the baseline returned shares, returned no shares,
returned a reference code, leaked a `TypeError` or narrowed the label. The
`wide` recipes carry `bigint` inputs the baseline cannot receive at all; they
are counted and left to the Rust harness. Oversized safe integer labels match
the baseline and have no exception.

The test pins the SHA-256 below so an accidental rebuild cannot turn the
differential comparison into a comparison of the same implementation. These
historical bundles and their recorded commit/hash remain fixed. Use
`bun run test:differential` from the package root to run this check.

`bun run baseline:build` is a historical reconstruction tool: it requires the
corresponding source revision and compatible dependency baselines. Do not rebuild
the frozen artifacts from current source to make a differential failure pass.
For the separate comparison against Rust, see
[the Rust validation guide](../rust-validation/README.md).

Baseline commit: c45f44d1aedbd5da06c4e0fd0b553d8ece2b904b
Baseline sha256: 448e7858ace9d183f36a26c193678729c20554a8290e246db794f02772601307
