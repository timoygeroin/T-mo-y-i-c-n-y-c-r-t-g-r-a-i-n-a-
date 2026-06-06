import { compileContinuationHandoff } from "./continuation-handoff.js";
import type { ContinuationMoveInput, ContinuationStatusReceiptSurface } from "./index.js";

const branch = "monday-platform-genesis-01";
const priorHead = "06790fc3f0eb5fd05d614ae711d6567ac352d831";
const currentHead = "dd68b38e1d496ca39c8b9536f694880ad8300b88";

const passingStatus: ContinuationStatusReceiptSurface = {
  verdict: "passing_with_warnings",
  ok: true,
  decisive_successes: ["Route Governor Proof / proof examples: success"],
  blocking_failures: [],
  pending_surfaces: [],
  non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
};

function embodiment(overrides: Partial<ContinuationMoveInput> = {}): ContinuationMoveInput {
  return {
    move_class: "external_platform_embodiment",
    current_head_sha: currentHead,
    previous_readback_head_sha: priorHead,
    changed_files: ["platform/packages/route-governor/src/continuation-handoff.ts"],
    executable_artifacts: ["compileContinuationHandoff"],
    routing_artifacts: ["continuation handoff compiler"],
    new_check_run_ids: [],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runContinuationHandoffProof(): void {
  const movedHead = compileContinuationHandoff({
    branch,
    active_branch: branch,
    current_head_sha: currentHead,
    last_released_head_sha: priorHead,
    candidates: [{ candidate_id: "candidate", input: embodiment() }],
  });

  assert(movedHead.ok, "moved head should route to status readback");
  assert(movedHead.action === "read_current_head_status", `expected status readback, got ${movedHead.action}`);
  assert(!movedHead.status_claim_allowed, "moved head cannot claim status before a status surface is attached");

  const admittedEmbodiment = compileContinuationHandoff({
    branch,
    active_branch: branch,
    current_head_sha: currentHead,
    last_released_head_sha: currentHead,
    status_surface: passingStatus,
    candidates: [
      { candidate_id: "status-loop", input: embodiment({ move_class: "fresh_status_readback", changed_files: [], executable_artifacts: [], routing_artifacts: [] }) },
      { candidate_id: "handoff", input: embodiment() },
    ],
  });

  assert(admittedEmbodiment.ok, "passing status surface should allow executable embodiment selection");
  assert(admittedEmbodiment.action === "commit_external_embodiment", `expected embodiment, got ${admittedEmbodiment.action}`);
  assert(admittedEmbodiment.selected_candidate_id === "handoff", "handoff candidate should be selected");
  assert(admittedEmbodiment.rejected.length === 1, "status-loop candidate should be rejected");

  const pendingStatus = compileContinuationHandoff({
    branch,
    active_branch: branch,
    current_head_sha: currentHead,
    last_released_head_sha: currentHead,
    status_surface: {
      verdict: "pending",
      ok: false,
      decisive_successes: [],
      blocking_failures: [],
      pending_surfaces: ["Route Governor Proof / proof examples"],
      non_blocking_warnings: [],
    },
    candidates: [{ candidate_id: "handoff", input: embodiment() }],
  });

  assert(!pendingStatus.ok, "pending status must block handoff release");
  assert(pendingStatus.action === "block_release", `expected block release, got ${pendingStatus.action}`);
}

runContinuationHandoffProof();
