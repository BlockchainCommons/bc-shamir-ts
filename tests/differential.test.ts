/**
 * Differential harness: every corpus recipe is materialised with the frozen
 * baseline bundle (its own crypto inlined) AND the working tree; outcomes,
 * including error codes, must be identical except for the allowed
 * differences listed below, each with an asserted hit count. Categories the
 * baseline cannot run at all (`NO_BASELINE`) are counted and checked against
 * the Rust harness only.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as baselineMod from "./baseline/shamir-baseline.mjs";
import * as randBaseline from "./baseline/rand-baseline.mjs";
import * as src from "../src";
import * as rand from "@blockchaincommons/rand";
import { materialize, baselineAdapterFor, currentAdapterFor, recipeName } from "./vectors/recipes";
import { categories, NO_BASELINE } from "./corpus/corpus";

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE_SHA256 = "448e7858ace9d183f36a26c193678729c20554a8290e246db794f02772601307";

const baseline = baselineAdapterFor(baselineMod, randBaseline);
const current = currentAdapterFor(src, rand);

/** The only allowed differences, each keyed by the category it may appear in. */
const ALLOWED_DIFFERENCES: { id: string; category: string; tree: string; hits: number }[] = [
  {
    // A `threshold`, `shareCount` or index label that is not a usize (NaN, a
    // fraction, a negative, an infinity, or a number past the safe range) is
    // `InvalidParameter` in the tree. The baseline returned shares, returned
    // no shares, returned a reference code, leaked a `TypeError`, or narrowed
    // the label and recovered with it.
    id: "domain-errors",
    category: "domain",
    tree: "throw:InvalidParameter",
    hits: 17,
  },
];

describe("differential: baseline vs working tree", () => {
  it("baseline bundle integrity", () => {
    const sha = createHash("sha256")
      .update(readFileSync(join(here, "baseline/shamir-baseline.mjs")))
      .digest("hex");
    expect(sha).toBe(BASELINE_SHA256);
  });
  for (const [name, gen] of Object.entries(categories)) {
    it(`category ${name}`, { timeout: 120_000 }, () => {
      const allowed = ALLOWED_DIFFERENCES.find((d) => d.category === name);
      let n = 0;
      let allowedHits = 0;
      const diffs: string[] = [];
      const engineErrors: string[] = [];
      for (const recipe of gen()) {
        n++;
        const b = materialize(current, recipe);
        if (name in NO_BASELINE) {
          if (b === "throw:TypeError") engineErrors.push(recipeName(recipe));
          continue;
        }
        const a = materialize(baseline, recipe);
        if (a === b) continue;
        if (allowed !== undefined && b === allowed.tree) allowedHits++;
        else diffs.push(`${recipeName(recipe)}: ${a.slice(0, 80)} !== ${b.slice(0, 80)}`);
      }
      expect(n).toBeGreaterThan(0);
      expect(diffs).toEqual([]);
      expect(engineErrors).toEqual([]);
      if (name in NO_BASELINE) expect(n).toBe(NO_BASELINE[name]);
      if (allowed !== undefined) expect(allowedHits).toBe(allowed.hits);
    });
  }
});
