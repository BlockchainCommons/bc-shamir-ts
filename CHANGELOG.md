# Changelog

## 1.0.0-beta.1

Extracted from the [`paritytech/bcts`](https://github.com/paritytech/bcts)
monorepo (`@bcts/shamir`) and redesigned as an idiomatic TypeScript library;
see [MIGRATION.md](./MIGRATION.md). Every share byte is unchanged.

- `splitSecret(secret, { threshold, shareCount, rng? })` returns
  `ShamirShare[]` (`{ index, data }`); `recoverSecret(shares)` takes the
  same. `rng` defaults to the secure generator.
- One `ShamirError` with `code: "SecretTooLong" | "TooManyShares" |
  "ChecksumFailure" | "SecretTooShort" | "SecretNotEvenLen" |
  "InvalidThreshold" | "SharesUnequalLength"` and factories;
  `ShamirErrorType`, `ShamirResult` and the unreachable
  `InterpolationFailure` removed.
- `MIN_SECRET_LENGTH` / `MAX_SECRET_LENGTH` spell the word out.
- Interpolation uses a per-call scratch arena and register-local
  multiplication; the digest comparison is constant-time; every scratch
  buffer is zeroed.
- 734 golden vectors, a differential corpus against the frozen pre-redesign
  bundle, and a Rust cross-validation harness (`tests/rust-validation`,
  `bc-shamir 0.13.0`: 734/734 match, error variants included).

---

## History as `@bcts/shamir`

## [1.0.0-beta.6] - 2026-07-29

### Changed

- Workspace version bump

## [1.0.0-beta.5] - 2026-07-01

### Changed

- Workspace version bump

## [1.0.0-beta.4] - 2026-06-28

### Changed

- Dependency sync

## [1.0.0-beta.3] - 2026-06-22

### Changed

- Dependencies bump

## [1.0.0-beta.2] - 2026-06-16

### Changed

- Dependencies bump

## [1.0.0-beta.1] - 2026-05-27

### Changed

- Workspace version bump

## [1.0.0-beta.0] - 2026-04-27

### Changed

- Workspace version bump

## [1.0.0-alpha.23] - 2026-04-24

### Changed

- Workspace version bump

## [1.0.0-alpha.22] - 2026-03-01

### Changed

- Workspace version bump

## [1.0.0-alpha.21] - 2026-02-27

### Changed

- Workspace version bump

## [1.0.0-alpha.20] - 2026-02-12

### Changed

- Workspace version bump

## [1.0.0-alpha.19] - 2026-02-05

### Changed

- Workspace version bump
