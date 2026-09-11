# Frozen baseline build

`shamir-baseline.mjs` is the self-contained ESM bundle of `@blockchaincommons/shamir` built from
commit `c45f44d1aedbd5da06c4e0fd0b553d8ece2b904b`, the pre-redesign wire-format reference. The
sibling `@blockchaincommons/crypto` is INLINED from its own frozen baseline bundle, so this
bundle keeps the pre-redesign behaviour of that dependency after it changes. The pre-redesign
shamir API took an external RNG object rather than importing `@blockchaincommons/rand`
directly, so `rand-baseline.mjs` / `rand-baseline.d.mts` (a vendored copy of
`@blockchaincommons/rand`'s own frozen baseline) are here to construct one for the tests.
`shamir-baseline.d.mts` is the public surface at that commit.

`tests/differential.test.ts` runs every corpus recipe through this bundle and
the working tree and asserts identical outcomes; it pins the sha256 below so
an accidental rebuild cannot turn the differential into a self-comparison.

Baseline commit: c45f44d1aedbd5da06c4e0fd0b553d8ece2b904b
Baseline sha256: 448e7858ace9d183f36a26c193678729c20554a8290e246db794f02772601307
