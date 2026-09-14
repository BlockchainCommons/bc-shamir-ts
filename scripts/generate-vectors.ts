/**
 * Vector generator. Materialises recipes with the WORKING TREE.
 *
 *   bun scripts/generate-vectors.ts                 golden subset → tests/vectors/vectors.json
 *   bun scripts/generate-vectors.ts --full <path>   every corpus recipe → <path> (not committed; CI replays it)
 *
 * Regenerating the committed file is a deliberate, reviewed act.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as src from "../src/index.ts";
import * as rand from "@blockchaincommons/rand";
import { materialize, currentAdapterFor, recipeName } from "../tests/vectors/recipes.ts";
import { allRecipes, goldenRecipes } from "../tests/corpus/corpus.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const api = currentAdapterFor(src, rand);
const args = process.argv.slice(2);

const [recipes, out, label] = (() => {
  const full = args.indexOf("--full");
  if (full !== -1) {
    const path = args[full + 1];
    if (path === undefined) throw new Error("--full needs an output path");
    return [allRecipes(), path, "full corpus"] as const;
  }
  return [goldenRecipes(), join(root, "tests/vectors/vectors.json"), "golden"] as const;
})();

const vectors = [];
for (const recipe of recipes)
  vectors.push({ name: recipeName(recipe), recipe, expect: materialize(api, recipe) });
writeFileSync(out, JSON.stringify({ count: vectors.length, vectors }, null, 1) + "\n");
console.log(`wrote ${vectors.length} ${label} vectors to ${out}`);
