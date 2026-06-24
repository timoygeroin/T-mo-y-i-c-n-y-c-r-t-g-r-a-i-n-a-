import { compilePostCommitStatusBoundary, type PostCommitStatusBoundaryInput } from "./post-commit-status-boundary.js";

const branch = "monday-platform-genesis-01";
const previousHead = "a9843be690dcdd8a94fef795261517be8ab9e027";
const currentHead = "post-commit-head";

function input(overrides: Partial<PostCommitStatusBoundaryInput> = {}): PostCommitStatusBoundaryInput {
  return {
    branch,
    active_branch: branch,
    previous_head_sha: previousHead,
    current_head_sha: currentHead,
    status_surface: {
      expected_head_sha: currentHead,
      check_runs: [
        {
          id: "current-proof",
          name: "Route Governor Proof / proof examples",
          status: "completed",
          conclusion: "success",
          head_sha: currentHead,
        },
      ],
      workflow_runs: [],
      notices: ["Node.js 20 Actions deprecation notice"],
    },
    executable_artifacts: ["compilePostCommitStatusBoundary"],
    routing_artifacts: ["post-commit status boundary"],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runPostCommitStatusBoundaryProof(): void {
  const movedWithoutStatus = compilePostCommitStatusBoundary(input({ status_surface: undefined }));
  assert(movedWithoutStatus.ok, "moved head without status should route to readback");
  assert(
    movedWithoutStatus.action === "read_current_head_status",
    `expected read_current_head_status, got ${movedWithoutStatus.action}`,
  );
  assert(!movedWithoutStatus.status_claim_allowed, "moved head cannot claim status before current-head checks are read");

  const staleStatus = compilePostCommitStatusBoundary(
    input({
      status_surface: {
        expected_head_sha: previousHead,
        check_runs: [
          {
            id: "old-proof",
            name: "Route Governor Proof / proof examples",
            status: "completed",
            conclusion: "success",
            head_sha: previousHead,
          },
        ],
        workflow_runs: [],
        notices: [],
      },
    }),
  );
  assert(!staleStatus.ok, "stale status surface must not authorize the moved head");
  assert(staleStatus.action === "block_stale_status_claim", `expected stale block, got ${staleStatus.action}`);

  const pending = compilePostCommitStatusBoundary(
    input({
      status_surface: {
        expected_head_sha: currentHead,
        check_runs: [
          {
            id: "pending-proof",
            name: "Route Governor Proof / proof examples",
            status: "in_progress",
            conclusion: null,
            head_sha: currentHead,
          },
        ],
        workflow_runs: [],
        notices: [],
      },
    }),
  );
  assert(!pending.ok, "pending current-head checks must block the next embodiment");
  assert(pending.action === "wait_for_checks", `expected wait_for_checks, got ${pending.action}`);

  const passing = compilePostCommitStatusBoundary(input());
  assert(passing.ok, "passing current-head checks plus committed artifacts should allow next embodiment selection");
  assert(passing.action === "allow_next_embodiment", `expected allow_next_embodiment, got ${passing.action}`);
  assert(passing.status_claim_allowed, "current-head passing status should allow a status claim");
  assert(passing.warnings.length === 1, "Node.js 20 deprecation should remain a warning");

  const missingArtifacts = compilePostCommitStatusBoundary(input({ executable_artifacts: [], routing_artifacts: [] }));
  assert(!missingArtifacts.ok, "passing checks without committed embodiment evidence must still block release");
  assert(missingArtifacts.action === "block_release", `expected block_release, got ${missingArtifacts.action}`);
}

runPostCommitStatusBoundaryProof();
