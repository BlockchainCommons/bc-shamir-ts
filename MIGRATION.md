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
      a `threshold`, `shareCount` or share `index` outside its integer
      domain (previously zero shares, a `TypeError`, or implicit coercion).
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
old API returned at position `i`. `rng` is optional and defaults to the
secure generator from `@blockchaincommons/rand`; pass a `SeededRng` for
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
| `shareCount: NaN` → `[]`; `threshold: 1.5` → `TypeError` | `ShamirError` `InvalidParameter` with `details: { parameter, value }` |
| `e.type === X` | `e.code === "X"` or `e.is("X")`; `e.details.code` narrows the payload |

The algorithmic validation order remains: `TooManyShares`,
`InvalidThreshold`, `SecretTooLong`, `SecretTooShort`, `SecretNotEvenLen`,
then `SharesUnequalLength` on recovery. The `InvalidParameter` integer
checks run before that chain for `threshold` and `shareCount`, and after
length checks for share indexes. All three accept non-negative safe integers
up to `Number.MAX_SAFE_INTEGER`, before applying the smaller share-count and
threshold limits. This does not cover the full 64-bit Rust `usize` domain.
For example, `2 ** 53` is exactly representable but fails the safe-integer
contract: TypeScript throws `InvalidParameter` where Rust may recover a share or
return `TooManyShares` / `InvalidThreshold`. The package retains this bound to
avoid accepting labels rounded before the call. There is no bigint input API.

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

## 5. Node and TypeScript floors

Node **22.12** and TypeScript **5.7**. The IIFE / global-script build is
gone; use the ESM or CJS entry.

## 6. Retained behavior

- Generated share bytes and indexes, the digest share (index 254) and secret
  (index 255) layout, the four-byte HMAC-SHA-256 checksum, and the RNG
  draw order (`threshold − 2` whole shares, then `length − 4` bytes).
- `threshold === 1` returns copies of the secret and draws no randomness.
- Shares remain paired `{ index, data }` objects. The wrappers returned by split
  are frozen; their byte buffers and the outer array remain mutable.
- The package keeps its exception API, existing constant names, and optional
  secure RNG default. No Result wrapper or constant aliases are added.
- Recovery clears its candidate secret on checksum failure, and interpolation
  clears its scratch arenas on normal return. This is best-effort cleanup,
  with no guarantee that JavaScript runtime copies have been erased.

See [RUST_DIVERGENCES.md](./RUST_DIVERGENCES.md) for the source comparison and
reasons for retaining these choices.
