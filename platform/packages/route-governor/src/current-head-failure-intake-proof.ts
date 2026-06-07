import {
  compileCurrentHeadFailureIntake,
  type CurrentHeadFailureIntakeInput,
} from "./current-head-failure-intake.js";

const branch = "monday-platform-genesis-01";
const head = "e1f755cf89daf234ceb727166cb74fbce3e5d51b";

function input(overrides: Partial<CurrentHeadFailureIntakeInput> = {}): CurrentHeadFailureIntakeInput {
  return {
    branch,
    active_branch: branch,
    head_sha: head,
    status_verdict: "failing",
    failure_surfaces: [
      {
        surface_id: "current-head-run",
        source: "actions_step_log",
        head_sha: head,
        check_name: "Monday Platform CI / Route governor proof surface",
        failed_step: "Run proof examples",
        exit_code: 1,
        assertion: "expected proof_chain_ready, got repair_proof_chain",
      },
    ],
    prior_failure_signatures: [],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runCurrentHeadFailureIntakeProof(): void {
  const actionable = compileCurrentHeadFailureIntake(input());
  assert(actionable.ok, `actionable failure should pass intake: ${actionable.blockers.join("; ")}`);
  assert(
    actionable.action === "repair_from_actionable_failure",
    `expected repair_from_actionable_failure, got ${actionable.action}`,
  );

  const publicOnly = compileCurrentHeadFailureIntake(
    input({
      failure_surfaces: [
        {
          surface_id: "public-check-summary",
          source: "public_checks_summary",
          head_sha: head,
          check_name: "Monday Platform CI / Route governor proof surface",
          failed_step: "Run proof examples",
          exit_code: 1,
          annotation_count: 1,
        },
      ],
    }),
  );
  assert(!publicOnly.ok, "public summary without log/assertion must not authorize repair");
  assert(
    publicOnly.action === "obtain_stronger_actions_log",
    `expected obtain_stronger_actions_log, got ${publicOnly.action}`,
  );

  const stale = compileCurrentHeadFailureIntake(
    input({
      failure_surfaces: [
        {
          surface_id: "stale-run",
          source: "actions_step_log",
          head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
          check_name: "Monday Platform CI / Route governor proof surface",
          failed_step: "Run proof examples",
          exit_code: 1,
          assertion: "stale repaired-head failure",
        },
      ],
    }),
  );
  assert(!stale.ok, "stale failure surface must not authorize current-head repair");
  assert(stale.action === "block_stale_failure_surface", `expected block_stale_failure_surface, got ${stale.action}`);
}

runCurrentHeadFailureIntakeProof();
