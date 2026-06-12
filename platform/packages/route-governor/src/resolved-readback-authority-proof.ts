import {
  compileResolvedReadbackAuthority,
  type ResolvedReadbackAuthorityInput,
  type ResolvedReadbackCheckReceipt,
} from "./resolved-readback-authority.js";

const RESOLVED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function checks(overrides: Partial<ResolvedReadbackCheckReceipt>[] = []): ResolvedReadbackCheckReceipt[] {
  const base: ResolvedReadbackCheckReceipt[] = [
    { run_id: "27049650678", workflow_name: "Monday Platform CI", event: "push", head_sha: RESOLVED_HEAD, conclusion: "success" },
    { run_id: "27049650677", workflow_name: "Route Governor Proof", event: "push", head_sha: RESOLVED_HEAD, conclusion: "success" },
    {
      run_id: "27049650682",
      workflow_name: "Monday Platform Route Governor",
      event: "push",
      head_sha: RESOLVED_HEAD,
      conclusion: "success",
    },
    {
      run_id: "27049651469",
      workflow_name: "Monday Platform Route Governor",
      event: "pull_request",
      head_sha: RESOLVED_HEAD,
      conclusion: "success",
    },
    { run_id: "27049651460", workflow_name: "Monday Platform CI", event: "pull_request", head_sha: RESOLVED_HEAD, conclusion: "success" },
    { run_id: "27049651459", workflow_name: "Route Governor Proof", event: "pull_request", head_sha: RESOLVED_HEAD, conclusion: "success" },
    {
      run_id: "27049651467",
      workflow_name: "PR Head Status Readback",
      event: "pull_request",
      head_sha: RESOLVED_HEAD,
      conclusion: "success",
    },
  ];

  return base.map((check, index) => ({ ...check, ...(overrides[index] ?? {}) }));
}

function input(overrides: Partial<ResolvedReadbackAuthorityInput> = {}): ResolvedReadbackAuthorityInput {
  return {
    active_branch: "monday-platform-genesis-01",
    branch: "monday-platform-genesis-01",
    resolved_head_sha: RESOLVED_HEAD,
    live_head_sha: RESOLVED_HEAD,
    issue_completed: true,
    blocker_label_removed: true,
    pr_ready_for_review: true,
    checks: checks(),
    warnings: ["Node.js 20 Actions deprecation notice"],
    candidate: {
      move_class: "external_platform_embodiment",
      artifact_class: "resolved-readback-authority",
      changed_files: ["platform/packages/route-governor/src/resolved-readback-authority.ts"],
      executable_artifacts: ["compileResolvedReadbackAuthority"],
      routing_artifacts: ["resolved repaired-head boundary cannot emit old blocker"],
      proof_artifacts: ["platform/packages/route-governor/src/resolved-readback-authority-proof.ts"],
      spent_artifact_classes: ["post-status-embodiment-queue"],
    },
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) {
    throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
  }
}

function expectFailure(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) {
    throw new Error(`${name} should fail, but passed`);
  }
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not fail for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

const admitted = compileResolvedReadbackAuthority(input());
expectOk("resolved readback authority", admitted.ok, admitted.blockers);
if (admitted.action !== "admit_post_resolution_embodiment") {
  throw new Error(`resolved readback authority chose ${admitted.action} instead of admit_post_resolution_embodiment`);
}
if (!admitted.quarantined_move_classes.includes("old_repaired_head_status_blocker")) {
  throw new Error("resolved readback authority did not quarantine the old repaired-head blocker");
}
if (admitted.warnings.length !== 1) {
  throw new Error("resolved readback authority should preserve warnings without turning them into blockers");
}

const oldBlocker = compileResolvedReadbackAuthority(
  input({
    candidate: {
      move_class: "old_repaired_head_status_blocker",
      artifact_class: "old-blocker",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
      spent_artifact_classes: [],
    },
  }),
);
expectFailure("old repaired-head blocker", oldBlocker.ok, oldBlocker.blockers, "repaired-head status-readback blocker is resolved");

const duplicateSummary = compileResolvedReadbackAuthority(
  input({
    candidate: {
      move_class: "duplicate_ci_summary",
      artifact_class: "summary",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
      spent_artifact_classes: [],
    },
  }),
);
expectFailure("duplicate CI summary", duplicateSummary.ok, duplicateSummary.blockers, "post-resolution move repeats non-progress class");

const unresolvedBoundary = compileResolvedReadbackAuthority(
  input({ blocker_label_removed: false, checks: checks([{ conclusion: "failure" }]) }),
);
expectFailure("unresolved boundary", unresolvedBoundary.ok, unresolvedBoundary.blockers, "blocked: ci-status-readback label is still present");
expectFailure("unresolved boundary check count", unresolvedBoundary.ok, unresolvedBoundary.blockers, "expected at least 7");

const incompleteEmbodiment = compileResolvedReadbackAuthority(
  input({
    candidate: {
      move_class: "external_platform_embodiment",
      artifact_class: "proof-only",
      changed_files: ["platform/packages/route-governor/src/resolved-readback-authority-proof.ts"],
      executable_artifacts: ["compileResolvedReadbackAuthority"],
      routing_artifacts: ["resolved readback authority"],
      proof_artifacts: ["platform/packages/route-governor/src/resolved-readback-authority-proof.ts"],
      spent_artifact_classes: [],
    },
  }),
);
expectFailure("proof-only embodiment", incompleteEmbodiment.ok, incompleteEmbodiment.blockers, "proof-only");
