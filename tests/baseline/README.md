# Frozen baseline build

`shamir-baseline.mjs` is the self-contained ESM bundle of `@blockchaincommons/shamir` built from
commit `c45f44d1aedbd5da06c4e0fd0b553d8ece2b904b`, the pre-redesign wire-format reference. Sibling
`@blockchaincommons/*` packages are INLINED from their own frozen baseline
bundles (@blockchaincommons/crypto, @blockchaincommons/rand, @blockchaincommons/tags), so this bundle keeps the
pre-redesign behaviour of its dependencies after they change.
`shamir-baseline.d.mts` is the public surface at that commit (Phase 0.5).

`tests/differential.test.ts` runs every corpus recipe through this bundle and
the working tree and asserts identical outcomes; it pins the sha256 below so
an accidental rebuild cannot turn the differential into a self-comparison.

Baseline commit: c45f44d1aedbd5da06c4e0fd0b553d8ece2b904b
Baseline sha256: 37ca5e28395caa763dab0a037e079a831956b9e5ebef8d0402e2c4151415f751
