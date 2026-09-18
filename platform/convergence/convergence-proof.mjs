import assert from "node:assert/strict";
import fs from "node:fs";
import { applyCellDelta, evaluateDelivery } from "./convergence-controller.mjs";

const initial = JSON.parse(fs.readFileSync(new URL("./MONDAYID_SYSTEM_STATE.json", import.meta.url), "utf8"));

{
  const out = applyCellDelta(initial, {
    schema:"mondayid.cell-delta.v1",
    delta_id:"d1",
    cell_id:"chat-A",
    parent_state_id:initial.state_id,
    kind:"WORK",
    effect:"Integrate tested transport",
    product_line_patch:{id:"live_model_transport",patch:{state:"PORTING_TO_CANON"}}
  });
  assert.equal(out.ok, true);
  assert.equal(out.state.product_lines.live_model_transport.state, "PORTING_TO_CANON");
  assert.notEqual(out.state.state_id, initial.state_id);
}

{
  const out = applyCellDelta(initial, {
    schema:"mondayid.cell-delta.v1",
    delta_id:"stale",
    cell_id:"chat-B",
    parent_state_id:"older-state",
    kind:"WORK"
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, "STALE_PARENT");
}

{
  const out = applyCellDelta(initial, {
    schema:"mondayid.cell-delta.v1",
    delta_id:"arch",
    cell_id:"chat-C",
    parent_state_id:initial.state_id,
    kind:"NEW_ARCHITECTURE"
  });
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

console.log("MONDAYID_CONVERGENCE_PROOF_PASS");
