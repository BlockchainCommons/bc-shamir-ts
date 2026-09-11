/**
 * Limits shared by split and recover. They are wire: SSKR shares carry
 * secrets within these bounds and nothing else.
 *
 * @module constants
 */

/** Shortest secret that can be split, in bytes. */
export const MIN_SECRET_LENGTH = 16;
/** Longest secret that can be split, in bytes. */
export const MAX_SECRET_LENGTH = 32;
/** Most shares a split can produce. */
export const MAX_SHARE_COUNT = 16;
