# Rust reference cross-validation

Replays the golden vectors (`tests/vectors/vectors.json`) and, in CI, the
whole recipe corpus against `bc-shamir = "=0.13.0"` over `bc-rand = "=0.5.0"`,
on a 64-bit Rust target (the harness asserts it).

```sh
cd tests/rust-validation
cargo run --release --offline -- ../vectors/vectors.json
# the full corpus (5,271 vectors; the golden file is a subset of it):
bun run vectors:full "$TMPDIR/shamir-full-corpus.json"
cargo run --release --offline -- "$TMPDIR/shamir-full-corpus.json"
```

Result lines:

```
783 vectors - 762 match, 21 js-only, 0 MISMATCH
5271 vectors - 5250 match, 21 js-only, 0 MISMATCH
```

Exit 0 iff every vector matches the Rust reference or is JS-only. There is no
expected-divergence allowlist: a difference is a MISMATCH and a bug on one side
or the other. Outcomes are the share bytes (`hex,hex,…`; a `;` separates the
two splits of a consecutive-split recipe), the recovered secret, or
`throw:<variant>`, which the harness compares with `format!("{:?}", e)`.

## JS-only vectors

A recipe integer (`t`, `n`, an index label) is compared only when it has an
exact Rust form:

- a JSON number that is an integer in `[0, 2^53 − 1]`, the range a JavaScript
  `number` holds exactly. Any other JSON number (`NaN`, a fraction, a
  negative, or a value above `Number.MAX_SAFE_INTEGER`, which TypeScript
  rejects as a `number` and serde would read by its decimal digits) is
  js-only;
- a `"<digits>n"` string, the recipe form of a `bigint`, when the digits fit
  a `u64`. A negative one, or one above `u64::MAX`, is js-only.

Anything else in a recipe is `unparsable`: counted, printed, and a failure
(exit 1), never a panic. No vector field is unwrapped outside a vector's
`catch_unwind`.

The 21 js-only vectors are the `domain` rows (`NaN`, fractions, negatives,
infinities, numbers past the safe range) and the four out-of-range bigints
in `wide`. Wrong argument types (a string secret, a non-array share set) are
unit tests only: a recipe cannot express them.

## Generators

Seeded recipes drive `bc-rand`'s `SeededRandomNumberGenerator` from the same
xoshiro state as TypeScript's `SeededRng`; `fill_random_data` and
`fillBytes` both take one 64-bit step per byte. Counter recipes use 0, 17,
34, …, restarting at zero for each fill, as the Rust crate's tests do. A
recipe's generator is created once, so a `then` recipe's second split draws
from where the first stopped on both sides. Neither fixture is a production
generator.

## Self-check

`mismatch.json` is a committed copy of one seeded split with the last nibble
of a share flipped. The harness must report `1 vectors - 0 match, 0 js-only,
1 MISMATCH` and exit 1 on it; CI checks that it does.

## CI

The `rust-validation` job in `.github/workflows/ci.yml` runs `bun run
test:golden`, materialises the full corpus with `bun run vectors:full`, fetches
the pinned crates (`cargo fetch --locked`) and replays the golden file and the
corpus offline, then runs the self-check. A MISMATCH, an unparsable vector or
a passing self-check fails the job.

## Maintenance

When the reference moves: update the pins in `Cargo.toml`, run
`cargo update -p bc-shamir -p bc-rand`, update `.github/versions.yml`, run
`bun run vectors:generate`, review the diff, run both replays and copy the
result lines into `RUST_DIVERGENCES.md`. Never change an expected outcome
only to hide a mismatch.
