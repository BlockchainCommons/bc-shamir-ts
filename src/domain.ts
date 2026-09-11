/**
 * Integer domains the reference's types imply.
 *
 * TypeScript has no integer widths: `usize` is a `number` that must be a
 * safe non-negative integer, `u8` one in `[0, 255]`. A value outside its
 * domain is a `ShamirError` `InvalidParameter`.
 *
 * @module domain
 */
import { ShamirError, type ShamirParameter } from "./error.js";

/** The inclusive bounds of an integer domain. */
export interface Bounds {
  readonly min: number;
  readonly max: number;
}

/** `usize`: a safe non-negative integer. */
export const USIZE: Bounds = { min: 0, max: Number.MAX_SAFE_INTEGER };
/** `u8`: the share index domain. */
export const U8: Bounds = { min: 0, max: 0xff };

/** `true` when `value` is an integer `number` within `bounds`. */
export function isIntIn(value: number, bounds: Bounds): boolean {
  return Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
}

/** Throws `InvalidParameter` unless `value` is an integer within `bounds`. */
export function expectInt(parameter: ShamirParameter, value: number, bounds: Bounds): void {
  if (!isIntIn(value, bounds)) throw ShamirError.invalidParameter(parameter, value, bounds);
}
