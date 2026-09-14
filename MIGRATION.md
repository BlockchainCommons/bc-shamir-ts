# Migrating from `@bcts/shamir` to `@blockchaincommons/shamir`

`@blockchaincommons/shamir` is the redesigned successor to `@bcts/shamir`.

## TL;DR checklist

- [ ] Replace the `@bcts/shamir` dependency with `@blockchaincommons/shamir`.
- [ ] Rewrite import specifiers: `@bcts/shamir` becomes `@blockchaincommons/shamir`.
- [ ] `splitSecret(threshold, shareCount, secret, rng)` →
      `splitSecret(secret, { threshold, shareCount, rng })`, returning
      `ShamirShare[]` (`{ index, data }`).
- [ ] `recoverSecret(indexes, shares)` → `recoverSecret(shares)` with
      `ShamirShare` objects.
- [ ] `ShamirErrorType.X` / `error.type` → the string `"X"` / `error.code`;
      `ShamirResult` is gone. A new code, `InvalidParameter`, is thrown for
      a `threshold`, `shareCount` or share `index` that is not a `usize`
      (a safe-integer `number` or a `bigint` in `[0, 2^64 − 1]`) and for an
      argument of the wrong type (`@bcts/shamir` returned zero shares,
      leaked a `TypeError`, or coerced the value).
- [ ] The share objects `splitSecret` returns are frozen; copy one before
      changing its `index`.
- [ ] `MIN_SECRET_LEN` / `MAX_SECRET_LEN` → `MIN_SECRET_LENGTH` / `MAX_SECRET_LENGTH`.
- [ ] Raise your Node floor to **22.12** and TypeScript to **>= 5.7**.

## 1. Package name and imports

```diff
- import { splitSecret } from "@bcts/shamir";
+ import { splitSecret } from "@blockchaincommons/shamir";
```

## 2. Shares carry their index

```diff
- const shares = splitSecret(3, 5, secret, rng);           // Uint8Array[]
- const secret2 = recoverSecret([1, 2, 4], [shares[1], shares[2], shares[4]]);
+ const shares = splitSecret(secret, { threshold: 3, shareCount: 5, rng }); // ShamirShare[]
+ const secret2 = recoverSecret([shares[1], shares[2], shares[4]]);
```

`ShamirShare` is `{ readonly index: number; readonly data: Uint8Array }`.
`shares[i].index === i` and `shares[i].data` holds exactly the bytes the
old API returned at position `i`. `recoverSecret` takes `ShamirShareInput`,
`{ readonly index: number | bigint; readonly data: Uint8Array }`, which a
`ShamirShare` satisfies. `rng` is optional and defaults to the secure
generator from `@blockchaincommons/rand`; pass a `SeededRng` for
reproducible splits.

## 3. Errors

Library validation and checksum errors use `ShamirError` with a `code` union.
Its eight Rust variants preserve their messages; `InvalidParameter` is an
additional code for the TypeScript input contract. RNG and dependency failures
can propagate separately:

```ts
try {
  recoverSecret(shares);
} catch (e) {
  if (ShamirError.isShamirError(e) && e.code === "ChecksumFailure") {
    /* wrong, missing or altered shares */
  }
}
```

| `@bcts/shamir` | `@blockchaincommons/shamir` |
| --- | --- |
| `error.type === ShamirErrorType.ChecksumFailure` | `error.code === "ChecksumFailure"` |
| `new ShamirError(ShamirErrorType.X)` | `ShamirError.x()` factories, e.g. `ShamirError.checksumFailure()` |
| `ShamirErrorType.InterpolationFailure` | `"InterpolationFailure"`; `ShamirError.interpolationFailure()` |
| `ShamirResult<T>` | removed (`T`) |
| `shareCount: NaN` → `[]`; `threshold: 1.5` → `TypeError`; a string secret → shares | `ShamirError` `InvalidParameter` with `details: { parameter, value }` |
| `e.type === X` | `e.code === "X"` or `e.is("X")`; `e.details.code` narrows the payload |

The algorithmic validation order remains: `TooManyShares`,
`InvalidThreshold`, `SecretTooLong`, `SecretTooShort`, `SecretNotEvenLen`,
then `SharesUnequalLength` on recovery. The `InvalidParameter` checks run
around that chain: argument types (`options` an object, `secret` and share
`data` a `Uint8Array`, `shares` an array of objects) and the `threshold` and
`shareCount` integers before it, share indexes after the length checks.

`threshold`, `shareCount` and `index` are `usize` values in Rust, up to
`2^64 − 1` on a 64-bit target. Pass them as a `number` when they are safe
integers (up to `Number.MAX_SAFE_INTEGER`) and as a `bigint` beyond that:
`splitSecret(secret, { threshold: 3n, shareCount: 5n })` and
`{ index: 2n ** 64n - 1n, data }` are exact, and get the reference's
outcome (`2n ** 53n` shares is `TooManyShares`; a label of `2n ** 64n - 1n`
is `255` after the reference's `as u8` narrowing). A `number` of `2 ** 53`
or more is rejected, because such a double also stands for the integers
that round to it (the literal `9007199254740993` is `2 ** 53`); the message
names the `bigint` form.

### Changes from 1.0.0-beta.2

- `threshold`, `shareCount` and `index` accept `bigint`; `recoverSecret`
  takes `ShamirShareInput`. Existing `number` calls are unchanged.
- `ShamirError.invalidParameter(parameter, value)` has no `bounds`
  argument; `details.value` is `unknown`; the message reads `"<parameter>
  must be an integer in [0, 9007199254740991] or a bigint in
  [0, 18446744073709551615], got <value>"` for an integer parameter, and
  `"<parameter> must be an object / a Uint8Array / an array, got <value>"`
  for a wrongly typed argument. Code that matched the old message text must
  change; code that branches on `code` and `details.parameter` need not.
- Wrongly typed arguments are `InvalidParameter` at every threshold. A
  string secret or `number[]` data at threshold 1 no longer returns shares.
- Draws go through `@blockchaincommons/rand`'s `fillRandomBytes`. A
  generator without a callable `fillBytes` throws rand's `RandError`
  `InvalidGenerator` at the first draw (it threw an engine `TypeError`); a
  generator's own error still propagates unwrapped.

### Changes from 1.0.0-beta.1 to 1.0.0-beta.2

Recovery now accepts indexes above 255 within the supported integer domain.
For two or more shares, indexes are reduced modulo 256, matching Rust's `as u8`:
`256` and `65536` identify the same interpolation point as `0`. Single-share
recovery accepts any supported index and returns a copy of the data. Calls that
previously threw `InvalidParameter` for oversized safe integer labels can now
succeed. If an application requires byte-sized labels, validate that constraint
before calling recovery. Negative, fractional, non-finite, and unsafe integer
indexes remain invalid, including for a single share.

`InterpolationFailure` is restored to the error-code union. Add it to exhaustive
switches and error-code records. Its factory uses the message `interpolation failed`;
current split and recovery paths do not produce this error.

## 4. Renames

| `@bcts/shamir` | `@blockchaincommons/shamir` |
| --- | --- |
| `MIN_SECRET_LEN` | `MIN_SECRET_LENGTH` |
| `MAX_SECRET_LEN` | `MAX_SECRET_LENGTH` |
| `MAX_SHARE_COUNT` | unchanged |
