# Rust reference cross-validation

Replays `tests/vectors/vectors.json` against `bc-shamir = 0.13.0`.

```sh
cd tests/rust-validation
cargo run --release -- ../vectors/vectors.json
```

Seeded recipes drive `bc-rand`'s `SeededRandomNumberGenerator` from the same
xoshiro state; "fake" recipes use the counter generator (0, 17, 34, …) the
crate's own tests use. Outcomes compare exactly, including the error
variant (`throw:ChecksumFailure`). Exit 0 iff every vector matches. Not
wired into CI (needs a Rust toolchain); run manually before any release.
