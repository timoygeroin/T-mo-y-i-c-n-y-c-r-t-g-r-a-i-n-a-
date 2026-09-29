import { compileContinuityCheckpoint, applyContinuityDelta, type ContinuityCheckpointInput } from "./index.js";
import { createRecoveryService } from "./recover.js";

const seed: ContinuityCheckpointInput = {
  kernel_id: "mondayid", subject_id: "MondayID", sequence: 1, previous_fingerprint: null,
  active_track: "one task", active_target_id: "continue", laws: ["truth before beauty"],
  targets: [{ target_id: "continue", result_invariant: "same line", acceptance_tests: ["readback"], status: "BUILDING", unresolved_remainder: [] }],
  artifacts: [{ artifact_id: "current-instruction", kind: "law", tier: "direct_current_instruction", reference: "Dima current turn", content_hash: "sha256:direct", created_at: null, parent_ids: [], claims: ["one Monday across Chat and Work"], status: "present", private: true },
    { artifact_id: "old-archive", kind: "raw_chat", tier: "raw_chat_export", reference: "legacy ZIP index", content_hash: null, created_at: null, parent_ids: [], claims: [], status: "referenced_only", private: true }],
};
let checkpoint = compileContinuityCheckpoint(seed);
if (!checkpoint.ok) throw new Error(`fixture checkpoint invalid: ${checkpoint.blockers.join("; ")}`);
let reads = 0;
const service = createRecoveryService({
  authorize: (account) => account === "dima",
  readCheckpoint: () => { reads++; return checkpoint; },
});
const request = { account_id: "dima", surface: "chat" as const, policy_version: "1", source_manifest_hash: "manifest-1" };
const first = await service.recover(request);
const second = await service.recover({ ...request, surface: "work" });
if (first.packet !== second.packet || first.fingerprint !== second.fingerprint || second.cache_hit !== true
  || first.model_calls !== 0 || second.model_calls !== 0 || checkpoint.sequence !== 1 || reads !== 2) {
  throw new Error("Chat and Work did not reuse the same zero-model recovery");
}
if (!first.missing.includes("old-archive")) throw new Error("Missing archive was promoted to present");
try {
  await service.recover({ ...request, account_id: "other" });
  throw new Error("Cross-account access was admitted");
} catch (error) {
  if (!(error instanceof Error) || error.message !== "Recovery access denied") throw error;
}
const updated = applyContinuityDelta(checkpoint, { delta_id: "new-direct-evidence", parent_fingerprint: checkpoint.fingerprint, law_additions: ["read current correction"] });
if (!updated.ok || !updated.checkpoint) throw new Error("Supported delta was rejected");
checkpoint = updated.checkpoint;
const third = await service.recover(request);
if (third.cache_hit || third.fingerprint === first.fingerprint || third.revision !== 2) {
  throw new Error("New evidence did not invalidate recovery");
}
const stale = applyContinuityDelta(checkpoint, { delta_id: "stale", parent_fingerprint: first.fingerprint, law_additions: ["must not apply"] });
if (stale.ok) throw new Error("Stale correction overwrote the checkpoint");
console.log("PASS: shared recovery, zero model calls, account isolation, invalidation, stale-write rejection");
