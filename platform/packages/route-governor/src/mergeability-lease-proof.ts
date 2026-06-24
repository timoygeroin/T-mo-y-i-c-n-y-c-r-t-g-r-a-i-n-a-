import { compileMergeabilityLease, type MergeabilityLeaseInput } from "./mergeability-lease.js";

const liveHead = "f116aaf88640d68ea7c84f321945a1b332857c39";

function baseInput(overrides: Partial<MergeabilityLeaseInput> = {}): MergeabilityLeaseInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    lease_id: "mergeability-live-head-f116aaf",
    spent_lease_ids: [],
    target: "finalization_surface_promotion",
    source: {
      source_id: "pr-2-live-metadata-f116aaf",
      kind: "live_pr_metadata",
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      mergeable: true,
      evidence: ["PR #2 live metadata reports mergeable true on the live head"],
    },
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) throw new Error(`${name} should block, but passed`);
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runMergeabilityLeaseProof(): void {
  const admitted = compileMergeabilityLease(baseInput());
  expectOk("live-head mergeability lease", admitted.ok, admitted.blockers);
  if (admitted.action !== "admit_mergeability_lease") {
    throw new Error(`unexpected mergeability action: ${admitted.action}`);
  }
  if (!admitted.decisive_evidence.includes("mergeable true")) {
    throw new Error("admitted lease did not preserve live mergeable evidence");
  }

  const prBodySummary = compileMergeabilityLease(
    baseInput({
      source: {
        ...baseInput().source,
        source_id: "pr-body-claims-mergeable",
        kind: "pr_body_summary",
      },
    }),
  );
  expectBlock("PR body mergeability summary", prBodySummary.ok, prBodySummary.blockers, "pr_body_summary");

  const staleRepairedHead = compileMergeabilityLease(
    baseInput({
      source: {
        ...baseInput().source,
        head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      },
    }),
  );
  expectBlock("stale repaired-head mergeability", staleRepairedHead.ok, staleRepairedHead.blockers, "not live head");

  const repeatedLease = compileMergeabilityLease(baseInput({ spent_lease_ids: ["mergeability-live-head-f116aaf"] }));
  expectBlock("repeated mergeability lease", repeatedLease.ok, repeatedLease.blockers, "already spent");

  const missingMergeability = compileMergeabilityLease(
    baseInput({ source: { ...baseInput().source, mergeable: null } }),
  );
  expectBlock("missing mergeability verdict", missingMergeability.ok, missingMergeability.blockers, "did not include");

  const unmergeable = compileMergeabilityLease(baseInput({ source: { ...baseInput().source, mergeable: false } }));
  expectBlock("unmergeable live head", unmergeable.ok, unmergeable.blockers, "is not mergeable");
}

runMergeabilityLeaseProof();
