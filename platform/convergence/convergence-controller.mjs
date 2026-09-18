import crypto from "node:crypto";

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k)+":"+stable(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}
export function fingerprintState(state) {
  const copy = clone(state);
  delete copy.state_id;
  return crypto.createHash("sha256").update(stable(copy)).digest("hex").slice(0, 12);
}
export function evaluateDelivery(state) {
  const criteria = state?.delivery_criteria ?? {};
  const missing = Object.entries(criteria).filter(([,v]) => v !== true).map(([k]) => k);
  return { delivered: missing.length === 0, missing };
}
export function applyCellDelta(current, delta) {
  if (!current || current.schema !== "mondayid.system-state.v1") {
    return { ok:false, code:"INVALID_CANONICAL_STATE" };
  }
  if (!delta || delta.schema !== "mondayid.cell-delta.v1") {
    return { ok:false, code:"INVALID_CELL_DELTA" };
  }
  if (delta.parent_state_id !== current.state_id) {
    return { ok:false, code:"STALE_PARENT", expected:current.state_id, got:delta.parent_state_id };
  }
  if (current.release_status === "CONVERGING" && delta.kind === "NEW_ARCHITECTURE") {
    return { ok:false, code:"ARCHITECTURE_FREEZE_ACTIVE" };
  }
  if (delta.kind === "DELIVERY_CLAIM" && !delta.receipt) {
    return { ok:false, code:"DELIVERY_REQUIRES_RECEIPT" };
  }

  const next = clone(current);
  next.generation = Number(next.generation || 0) + 1;

  if (delta.product_line_patch) {
    const { id, patch } = delta.product_line_patch;
    if (!next.product_lines?.[id]) return { ok:false, code:"UNKNOWN_PRODUCT_LINE", id };
    next.product_lines[id] = { ...next.product_lines[id], ...patch };
  }

  if (delta.delivery_evidence) {
    for (const [key,value] of Object.entries(delta.delivery_evidence)) {
      if (!(key in next.delivery_criteria)) return { ok:false, code:"UNKNOWN_DELIVERY_CRITERION", key };
      next.delivery_criteria[key] = value === true;
    }
  }

  if (delta.next_move) next.next_move = delta.next_move;
  if (!Array.isArray(next.history)) next.history = [];
  next.history.push({
    generation:next.generation,
    cell_id:delta.cell_id,
    delta_id:delta.delta_id,
    kind:delta.kind,
    receipt:delta.receipt ?? null
  });
  next.history = next.history.slice(-50);

  const verdict = evaluateDelivery(next);
  next.release_status = verdict.delivered ? "DELIVERED_VERIFIED" : "CONVERGING";
  next.state_id = `mondayid-system:${next.generation}:${fingerprintState(next)}`;
  return { ok:true, state:next, delivery:verdict };
}

export function compileCellDelta(input={}) {
  return {
    schema:"mondayid.cell-delta.v1",
    delta_id:String(input.delta_id || ""),
    cell_id:String(input.cell_id || ""),
    parent_state_id:String(input.parent_state_id || ""),
    kind:String(input.kind || "WORK"),
    effect:String(input.effect || ""),
    product_line_patch:input.product_line_patch ?? null,
    delivery_evidence:input.delivery_evidence ?? null,
    next_move:input.next_move ?? null,
    receipt:input.receipt ?? null,
    created_at:input.created_at ?? new Date().toISOString()
  };
}
