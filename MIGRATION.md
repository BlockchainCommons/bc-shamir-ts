# Migrating from `@bcts/shamir` to `@blockchaincommons/shamir`

**Every share byte is unchanged.** Share values, index assignment, the RNG
draw order and the checksum are byte-identical to `@bcts/shamir` and to the
Rust reference `bc-shamir 0.13.0`; 734 golden vectors, a differential corpus
of ~5 400 recipes against the frozen pre-redesign bundle, and a Rust
cross-validation harness enforce that. What changed is the shape of the API.

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
      domain (previously zero shares, a `TypeError`, or a truncated index).
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

One class, `ShamirError`, with a `code` union:

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
| `ShamirErrorType.InterpolationFailure` | removed (unreachable in both implementations) |
| `ShamirResult<T>` | removed (`T`) |
| `shareCount: NaN` → `[]`; `threshold: 1.5` → `TypeError`; `index: 256` → recovers as 0 | `ShamirError` `InvalidParameter` with `details: { parameter, value }` |
| `e.type === X` | `e.code === "X"` or `e.is("X")`; `e.details.code` narrows the payload |

Messages are unchanged. Validation order is unchanged: `TooManyShares`,
`InvalidThreshold`, `SecretTooLong`, `SecretTooShort`, `SecretNotEvenLen`,
then `SharesUnequalLength` on recovery. The `InvalidParameter` integer
checks run *before* that chain for `threshold` and `shareCount` (so every
value the Rust reference could receive keeps its reference code) and after
the length checks for each share `index` (an integer in `[0, 255]`;
254, 255 and duplicates still fail the checksum, as in the reference).

## 4. Renames

| `@bcts/shamir` | `@blockchaincommons/shamir` |
| --- | --- |
| `MIN_SECRET_LEN` | `MIN_SECRET_LENGTH` |
| `MAX_SECRET_LEN` | `MAX_SECRET_LENGTH` |
| `MAX_SHARE_COUNT` | unchanged |

## 5. Node and TypeScript floors

Node **22.12** and TypeScript **5.7**. The IIFE / global-script build is
gone; use the ESM or CJS entry.

## 6. What did not change

- Share bytes, share indexes, the digest share (index 254) and secret
  (index 255) layout, the four-byte HMAC-SHA-256 checksum, and the RNG
  draw order (`threshold − 2` whole shares, then `length − 4` bytes).
- `threshold === 1` returns copies of the secret and draws no randomness.
