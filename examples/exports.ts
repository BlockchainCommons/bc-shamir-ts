/**
 * Lists the public surface of @blockchaincommons/shamir.
 *
 *   bun examples/exports.ts
 */
import * as lib from "@blockchaincommons/shamir";

for (const name of Object.keys(lib).sort()) {
  console.log(name);
}
