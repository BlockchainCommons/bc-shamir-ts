/**
 * The argument domains the reference's types imply.
 *
 * TypeScript has no 64-bit integer type. A `usize` arrives either as a
 * `number`, which is exact only up to `Number.MAX_SAFE_INTEGER`, or as a
 * `bigint`, which is exact over the whole `[0, 2^64 - 1]`. Anything else,
 * including a `number` above the safe range (a double there stands for
 * several integers), is a `ShamirError` `InvalidParameter`. Byte arguments
 * must be `Uint8Array`s and share sets arrays of objects; those checks run
 * before any reference check.
 *
 * @module domain
 */
import { ShamirError, type ShamirParameter } from "./error.js";

/** The reference's 64-bit `usize` maximum. */
export const USIZE_MAX: bigint = 0xffff_ffff_ffff_ffffn;

/**
 * `value` as an exact `usize`: a safe non-negative integer `number`, or a
 * `bigint` in `[0, USIZE_MAX]`; `undefined` for anything else.
 */
export function usizeOf(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value >= 0n && value <= USIZE_MAX ? value : undefined;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : undefined;
  }
  return undefined;
}

/** Throws `InvalidParameter` unless `value` is a `usize`; returns it exactly. */
export function expectUsize(parameter: ShamirParameter, value: unknown): bigint {
  const usize = usizeOf(value);
  if (usize === undefined) throw ShamirError.invalidParameter(parameter, value);
  return usize;
}

/** The reference's `as u8`: the low eight bits of a `usize`. */
export const toU8 = (value: bigint): number => Number(BigInt.asUintN(8, value));

/** `true` for a `Uint8Array`, including a `Buffer` and one from another realm. */
export function isBytes(value: unknown): value is Uint8Array {
  return (
    value instanceof Uint8Array ||
    (ArrayBuffer.isView(value) &&
      (value as { constructor?: { name?: unknown } }).constructor?.name === "Uint8Array")
  );
}

/** `true` for a non-null object (arrays included). */
export function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}
