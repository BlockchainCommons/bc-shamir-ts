# Rust reference cross-validation

Replays [the golden vectors](../vectors/vectors.json) against `bc-shamir = 0.13.0`
on a 64-bit Rust target. From the package root:

```sh
bun install --frozen-lockfile
bun run test:golden
cargo run --release --manifest-path tests/rust-validation/Cargo.toml -- tests/vectors/vectors.json
```

The TypeScript test first checks the stored outcomes against the current
implementation. The Rust harness then checks Rust against those same outcomes,
including error variant names such as `throw:ChecksumFailure`.

The current corpus has **748 vectors: 737 Rust matches, 11 JavaScript-only inputs,
and zero mismatches**. The 11 inputs contain negative, fractional, or non-finite
values that cannot be passed as Rust `usize` values. There is no divergence
allowance; any compared outcome mismatch produces exit code 1.

The corpus does not include integers above `Number.MAX_SAFE_INTEGER`. Those are
not all JavaScript-only inputs: Rust on a 64-bit target accepts values such as
`2^53`, while TypeScript rejects them. See
[RUST_DIVERGENCES.md](../../RUST_DIVERGENCES.md) for concrete examples and scope.
The harness parses integer fields as `u64` and casts to `usize`; use a 64-bit
Rust target so the cast preserves the values being tested.

Seeded recipes use matching xoshiro state and one 64-bit draw per output byte.
Counter recipes use 0, 17, 34, …, restarting at zero for each fill call, as the
Rust crate's tests do. Neither fixture is a production random generator.

Run this check manually before release; it is not in the JavaScript CI workflow
and requires a Rust toolchain. If behavior intentionally changes, regenerate
vectors with `bun run vectors:generate`, review the diff, and run both checks.
Never change expected outcomes only to hide a mismatch.
