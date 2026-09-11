/**
 * Differential harness: every corpus recipe is materialised with the frozen
 * baseline bundle (pre-redesign crypto inlined) AND the working tree;
 * outcomes, including error codes, must be identical.
 *
 * Tombstones are the only allowed differences, enumerated below. **T1**:
 * every `domain` recipe — a parameter or index label the reference cannot
 * express — throws `InvalidParameter` in the tree, where the baseline
 * returned nothing, leaked a `TypeError`, or truncated the label.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as baselineMod from "./baseline/shamir-baseline.mjs";
import * as randBaseline from "./baseline/rand-baseline.mjs";
import * as src from "../src";
import * as rand from "@blockchaincommons/rand";
import {
  materialize,
  baselineAdapterFor,
  redesignedAdapterFor,
  recipeName,
} from "./vectors/recipes";
import { categories } from "./corpus/corpus";

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE_SHA256 = "448e7858ace9d183f36a26c193678729c20554a8290e246db794f02772601307";

const baseline = baselineAdapterFor(baselineMod, randBaseline);
const current = redesignedAdapterFor(src, rand);

const TOMBSTONES = {
  T1: {
    landed: true,
    category: "domain",
    tree: "throw:InvalidParameter",
    beforeLanding: { tree: "throw:TypeError", rows: 2 },
  },
} as const;

describe("differential: baseline vs working tree", () => {
  it("baseline bundle integrity", () => {
    const sha = createHash("sha256")
      .update(readFileSync(join(here, "baseline/shamir-baseline.mjs")))
      .digest("hex");
    expect(sha).toBe(BASELINE_SHA256);
  });
  for (const [name, gen] of Object.entries(categories)) {
    it(`category ${name}`, { timeout: 120_000 }, () => {
      let n = 0;
      let tombstoned = 0;
      const diffs: string[] = [];
      const T1 = TOMBSTONES.T1;
      const t1 = name === T1.category;
      const accepted = T1.landed ? T1.tree : T1.beforeLanding.tree;
      for (const recipe of gen()) {
        n++;
        const a = materialize(baseline, recipe);
        const b = materialize(current, recipe);
        if (a === b) continue;
        if (t1 && b === accepted) tombstoned++;
        else diffs.push(`${recipeName(recipe)}: ${a.slice(0, 80)} !== ${b.slice(0, 80)}`);
      }
      expect(n).toBeGreaterThan(0);
      expect(diffs).toEqual([]);
      if (t1) expect(tombstoned).toBe(T1.landed ? n : T1.beforeLanding.rows);
    });
  }
});
