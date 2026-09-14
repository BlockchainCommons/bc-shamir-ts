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
3. **Mapping equivalences** - how a Rust construct maps to its TypeScript form (names, integer types, error shape, API shape, random streams) with identical outcomes.

## 1. True behavioral divergences

None. Every input the reference can receive has a TypeScript form with the
reference's outcome.

**A `usize` of `2⁵³` or more** (once a divergence, resolved). `threshold`,
`shareCount` and a share's `index` accept a `bigint` in `[0, 2⁶⁴ − 1]` as
well as a safe-integer `number`. Split compares the value exactly; recovery
narrows it with `BigInt.asUintN(8, ·)`, the reference's `as u8`; a single
share's index is not read. Executed side by side (fixture seed, 16-byte
secret `01…10`, 3-of-5 split) and pinned by the `wide` vectors:

| call | Rust | TypeScript (`bigint`) |
|---|---|---|
| split `threshold 1, shareCount 2⁵³` | `TooManyShares` | `TooManyShares` |
| split `threshold 2⁵³, shareCount 1` | `InvalidThreshold` | `InvalidThreshold` |
| split `threshold 2⁶⁴ − 1, shareCount 16` | `InvalidThreshold` | `InvalidThreshold` |
| split `threshold 1, shareCount 2⁶⁴ − 1` | `TooManyShares` | `TooManyShares` |
| recover `[2⁵³, 1, 2]` (≡ 0) | the secret | the secret |
| recover `[2⁵³ + 1, 1, 2]` (≡ 1, a duplicate) | `ChecksumFailure` | `ChecksumFailure` |
| recover `[2⁶⁴ − 256, 1, 2]` (≡ 0) | the secret | the secret |
| recover `[2⁶⁴ − 1, 1, 2]` (≡ 255) | `ChecksumFailure` | `ChecksumFailure` |
| recover `[2⁵³]` with a threshold of 1 | the share | the share |
| recover `[2⁶⁴ − 1]` with a threshold of 1 | the share | the share |

A `number` of `2⁵³` or more is still rejected; it is a JS-only
representation, not a reference value (section 2).

Everything else replays exactly against `bc-shamir 0.13.0` through
`tests/rust-validation`, in CI, on the golden file and on the full corpus
(`cargo run --release --offline -- ../vectors/vectors.json`):
**`783 vectors - 762 match, 21 js-only, 0 MISMATCH`** and
**`5271 vectors - 5250 match, 21 js-only, 0 MISMATCH`**. The harness has no
divergence allowance, and a committed one-vector fixture
(`tests/rust-validation/mismatch.json`) proves it fails on a single wrong
nibble.

## 2. JS-only input domain

Every entry below throws `ShamirError` `InvalidParameter` naming the
parameter, unless it says otherwise. The Rust harness counts vectored
entries as `js-only`.

- **A `number` above `Number.MAX_SAFE_INTEGER`** for `threshold`, `shareCount`
  or `index`. The reference accepts the integer it denotes, but a double of
  `2⁵³` or more also stands for the integers that round to it: the literal
  `9007199254740993` is `2⁵³`. Accepting it would recover with a label the
  caller never wrote where the reference returns `ChecksumFailure`. Pass a
  `bigint`; it is exact. Message: `"<parameter> must be an integer in
  [0, 9007199254740991] or a bigint in [0, 18446744073709551615], got <value>"`,
  with the received value rendered exactly (`9007199254740992`, `2n`, `"2"`).
- **Other values that are not a `usize`**: `NaN`, `±Infinity`, fractions,
  negatives, `bigint`s of `2⁶⁴` or more, and non-numbers. The `threshold` and
  `shareCount` checks run before the reference's five checks. The `index`
  check runs after `InvalidThreshold`, the secret-length codes and
  `SharesUnequalLength`, so a share set the reference rejects gets the
  reference's code.
- **Argument types.** An `options` that is not an object; a `secret` or share
  `data` that is not a `Uint8Array` (a `Buffer` or a cross-realm `Uint8Array`
  is accepted); a `shares` that is not an array; a share that is not an
  object. These are checked before any reference check, identically for
  every threshold, with the messages `"<parameter> must be an object / a
  Uint8Array / an array, got <value>"`. Each share's `index` and `data` and
  the secret's length are read once.
- **Generator behaviour** (not a `ShamirError`). A generator's own exception
  propagates unchanged and no shares are returned. A generator that breaks
  `@blockchaincommons/rand`'s contract (for example one without a callable
  `fillBytes`) fails at the draw with rand's `RandError` `InvalidGenerator`
  (`method: "fillBytes"`), not an engine `TypeError`.
  With a threshold of 1 nothing is drawn, so the generator is never touched.
  `rng` `undefined` or `null` selects the Web Crypto generator; the reference
  requires a caller-supplied generator.
- Indexes 254 and 255 and duplicates are not validated: both implementations
  interpolate them and the checksum decides (vectored).

## 3. Mapping equivalences

- **Integers.** `usize` ↔ safe-integer `number` or `bigint` in `[0, 2⁶⁴ − 1]`;
  `as u8` ↔ `BigInt.asUintN(8, ·)`. The contract is the 64-bit target; on a
  32-bit Rust target, values of `2³²` or more have no Rust form.
- **Random stream.** `fill_random_data` ↔ `fillBytes`, reached through rand's
  `fillRandomBytes` (one 64-bit step per byte on `SeededRng`). Split draws
  `threshold − 2` whole shares, then `length − 4` digest bytes, and nothing
  else; a threshold of 1 draws nothing. Consecutive splits from one generator
  are vectored. See the bc-rand-ts record for the stream table.
- **Zeroing.** The port zeroes its whole interpolation arena, and the candidate
  secret on checksum failure; the reference zeroes selected buffers. No
  returned byte or error differs.
- **Error shape.** `Error::X` ↔ `ShamirError` with `code: "X"`, `details` and
  `is(code)`. Messages are the reference's `Display` strings for all eight
  variants, including `InterpolationFailure`, which neither implementation
  produces. `InvalidParameter` carries `details: { parameter, value }`, with
  `value: unknown`.
- **Internal guards.** `hazmat.ts` throws `RangeError` where `hazmat.rs`
  `assert!`s. It is not exported and is unreachable from `splitSecret` and
  `recoverSecret`.
- **Immutability.** The `{ index, data }` objects `splitSecret` returns are
  frozen. The outer array and the `data` buffers stay writable, as `Vec`s are.
- **Constants.** `MIN_SECRET_LENGTH` / `MAX_SECRET_LENGTH` / `MAX_SHARE_COUNT`
  ↔ `MIN_SECRET_LEN` / `MAX_SECRET_LEN` / `MAX_SHARE_COUNT` (16 / 32 / 16).
- **API shape.** `split_secret(t, n, &secret, &mut rng)` ↔
  `splitSecret(secret, { threshold, shareCount, rng })`, returning
  `ShamirShare[]`. `recover_secret(&indexes, &shares)` ↔
  `recoverSecret(shares)` over `ShamirShareInput` objects `{ index, data }`.
  Because a share carries its index, the reference's `InvalidThreshold` for
  `indexes.len() != shares.len()` has no TypeScript form.
- **Vectors.** Outcomes are `hex,hex,…` (a `;` separates consecutive splits),
  `hex`, or `throw:<variant>`; the harness compares `format!("{:?}", e)`.
  Recipe integers are JSON numbers, compared only up to `2⁵³ − 1` (larger ones
  are js-only, as in TypeScript), or `"<digits>n"` strings for `bigint`s,
  parsed exactly. The harness asserts a 64-bit `usize` and never panics
  outside a vector.

## Maintenance

When the upstream reference moves:

1. Review the diff via the link in the `upstream.yml` tracking issue.
2. Port the relevant changes.
3. Update `.github/versions.yml` with the new version and commit, and the tracked version at the top of this file.
4. Run `bun run vectors:generate` and review the diff. Run the harness on the golden file and on `bun run vectors:full`; both must report `0 MISMATCH`.
5. Add, amend or remove entries, and keep the result lines equal to CI's.
