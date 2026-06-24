import assert from "node:assert/strict";
import test from "node:test";

import { extractPrBodyHeadClaims } from "./pr-body-head-claim-extractor.js";

test("extracts bounded status-bearing PR body head claims", () => {
  const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
  const movedHead = "df3a4035d6841ae19cc32443f0d4ef11449e65ac";
  const result = extractPrBodyHeadClaims({
    body: `
      Repaired-head status readback for ${repairedHead} succeeded.
      Current moved-head status readback obtained for ${movedHead}: current-head failure.
      Unclassified mention ${"a".repeat(40)} remains ignored.
    `,
    max_claims: 2,
  });

  assert.equal(result.ok, true);
  assert.equal(result.claims.length, 2);
  assert.equal(result.claims[0]?.kind, "repaired_head");
  assert.equal(result.claims[0]?.verdict, "passing");
  assert.equal(result.claims[1]?.kind, "status_readback_head");
  assert.equal(result.claims[1]?.verdict, "failing");
});

test("blocks invalid extraction limits", () => {
  const result = extractPrBodyHeadClaims({ body: "head b38ea247602ae8ebba80c4120ad03b41b26bd841", max_claims: 0 });

  assert.equal(result.ok, false);
  assert.match(result.blockers.join("\n"), /positive integer/);
});

test("does not promote bare SHAs without status semantics", () => {
  const result = extractPrBodyHeadClaims({
    body: "Commit b38ea247602ae8ebba80c4120ad03b41b26bd841 exists in history.",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.claims, []);
  assert.equal(result.ignored_head_lines.length, 1);
});
