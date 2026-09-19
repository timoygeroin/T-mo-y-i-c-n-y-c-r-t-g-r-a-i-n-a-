import assert from "node:assert/strict";
import fs from "node:fs";
import { applyCellDelta, evaluateDelivery, verifyCoordinationCAS } from "./convergence-controller.mjs";

const initial = JSON.parse(fs.readFileSync(new URL("./MONDAYID_SYSTEM_STATE.json", import.meta.url), "utf8"));
const blob = "blob-state-v2-A";

{
  const out = applyCellDelta(initial, {
    schema:"mondayid.cell-delta.v2",
    delta_id:"d1",
    cell_id:"chat-A",
    parent_state_id:initial.state_id,
    parent_state_blob_sha:blob,
    kind:"WORK",
    effect:"Integrate tested transport",
    product_line_patch:{id:"live_model_transport",patch:{state:"PORTING_TO_CANON"}}
  }, {observed_state_blob_sha:blob});
  assert.equal(out.ok, true);
  assert.equal(out.state.product_lines.live_model_transport.state, "PORTING_TO_CANON");
  assert.notEqual(out.state.state_id, initial.state_id);
}

{
  const out = applyCellDelta(initial, {
    schema:"mondayid.cell-delta.v2",
    delta_id:"stale-state",
    cell_id:"chat-B",
    parent_state_id:"older-state",
    parent_state_blob_sha:blob,
    kind:"WORK",
    effect:"stale semantic parent"
  }, {observed_state_blob_sha:blob});
  assert.equal(out.ok, false);
  assert.equal(out.code, "STALE_PARENT");
}

{
  const out = applyCellDelta(initial, {
    schema:"mondayid.cell-delta.v2",
    delta_id:"stale-blob",
    cell_id:"chat-C",
    parent_state_id:initial.state_id,
    parent_state_blob_sha:"old-blob",
    kind:"WORK",
    effect:"state changed after lock"
  }, {observed_state_blob_sha:"new-blob"});
  assert.equal(out.ok, false);
  assert.equal(out.code, "STALE_STATE_BLOB");
}

{
  // Critical regression: repository main movement is intentionally absent from the CAS.
  // The same semantic state/blob pair remains valid even if code had to rebase on a newer main.
  const cas = verifyCoordinationCAS(initial, {
    parent_state_id:initial.state_id,
    parent_state_blob_sha:blob
  }, {
    observed_state_blob_sha:blob,
    observed_main_head:"some-newer-main-sha"
  });
  assert.equal(cas.ok, true);
}

{
  const out = applyCellDelta(initial, {
    schema:"mondayid.cell-delta.v2",
    delta_id:"arch",
    cell_id:"chat-D",
    parent_state_id:initial.state_id,
    parent_state_blob_sha:blob,
    kind:"NEW_ARCHITECTURE",
    effect:"try another architecture"
  }, {observed_state_blob_sha:blob});
  assert.equal(out.ok, false);
  assert.equal(out.code, "ARCHITECTURE_FREEZE_ACTIVE");
}

{
  const verdict = evaluateDelivery(initial);
  assert.equal(verdict.delivered, false);
  assert.ok(verdict.missing.includes("visible_user_effect_verified"));
}

{
  const complete = structuredClone(initial);
  for (const key of Object.keys(complete.delivery_criteria)) complete.delivery_criteria[key] = true;
  assert.equal(evaluateDelivery(complete).delivered, true);
}

console.log("MONDAYID_CONVERGENCE_CAS_V2_PROOF_PASS");
