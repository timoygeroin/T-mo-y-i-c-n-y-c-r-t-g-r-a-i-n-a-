import type { HeadBoundCandidateNoveltyVerdict } from "./head-bound-candidate-novelty.js";

export type AdmittedCandidateWriteReceiptAction =
  | "accept_admitted_candidate_write"
  | "block_unadmitted_candidate"
  | "block_wrong_base_head"
  | "block_unmoved_write"
  | "block_artifact_mismatch"
  | "block_missing_behavior_receipt"
  | "block_missing_routing_receipt";

export interface AdmittedCandidateWriteReceiptInput {
  active_branch: string;
  admission: HeadBoundCandidateNoveltyVerdict;
  write_receipt_id: string;
  write_base_head_sha: string;
  resulting_head_sha: string;
  artifact_class: string;
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
}

export interface AdmittedCandidateWriteReceiptVerdict {
  ok: boolean;
  action: AdmittedCandidateWriteReceiptAction;
  branch: string;
  base_head_sha: string;
  resulting_head_sha: string;
  write_receipt_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executableBehaviorPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(?:ts|js|mjs)$/.test(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: AdmittedCandidateWriteReceiptInput): Pick<
  AdmittedCandidateWriteReceiptVerdict,
  "branch" | "base_head_sha" | "resulting_head_sha" | "write_receipt_id"
> {
  return {
    branch: input.active_branch,
    base_head_sha: input.write_base_head_sha,
    resulting_head_sha: input.resulting_head_sha,
    write_receipt_id: input.write_receipt_id.trim() || null,
  };
}

function block(
  input: AdmittedCandidateWriteReceiptInput,
  action: Exclude<AdmittedCandidateWriteReceiptAction, "accept_admitted_candidate_write">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): AdmittedCandidateWriteReceiptVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileAdmittedCandidateWriteReceipt(
  input: AdmittedCandidateWriteReceiptInput,
): AdmittedCandidateWriteReceiptVerdict {
  const evidence = [
    input.write_receipt_id.trim() || "<missing-write-receipt>",
    `admission ${input.admission.candidate_id}`,
    `base ${input.write_base_head_sha}`,
    `result ${input.resulting_head_sha}`,
  ];

  if (!input.admission.ok || input.admission.action !== "admit_head_bound_candidate") {
    return block(
      input,
      "block_unadmitted_candidate",
      ["write receipt cannot consume a candidate that was not admitted"],
      "route the candidate through head-bound novelty admission before writing",
      [...evidence, ...input.admission.blockers],
    );
  }

  if (input.write_base_head_sha !== input.admission.head_sha) {
    return block(
      input,
      "block_wrong_base_head",
      [`write base ${input.write_base_head_sha} does not match admitted head ${input.admission.head_sha}`],
      "discard the stale write receipt and re-admit the candidate against the live head",
      evidence,
    );
  }

  if (input.resulting_head_sha === input.write_base_head_sha) {
    return block(
      input,
      "block_unmoved_write",
      [`write receipt did not move head ${input.write_base_head_sha}`],
      "perform a real contents write before accepting the candidate receipt",
      evidence,
    );
  }

  if (input.artifact_class !== input.admission.admitted_artifact_class) {
    return block(
      input,
      "block_artifact_mismatch",
      [`write artifact ${input.artifact_class} does not match admitted artifact ${input.admission.admitted_artifact_class}`],
      "write only the artifact class that passed novelty admission",
      evidence,
    );
  }

  if (!input.changed_files.some(executableBehaviorPath) || input.behavior_artifacts.length === 0) {
    return block(
      input,
      "block_missing_behavior_receipt",
      ["admitted candidate write receipt has no behavior-bearing platform file"],
      "attach the behavior-bearing platform write before opening post-write status escrow",
      [...evidence, ...input.changed_files],
    );
  }

  if (input.routing_artifacts.length === 0) {
    return block(
      input,
      "block_missing_routing_receipt",
      ["admitted candidate write receipt has no future-routing artifact"],
      "name the future-routing artifact before accepting the write receipt",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_admitted_candidate_write",
    decisive_evidence: [
      ...evidence,
      input.artifact_class,
      ...input.changed_files.filter(executableBehaviorPath),
      ...input.behavior_artifacts,
      ...input.routing_artifacts,
    ],
    blockers: [],
    next_route: "open post-write status escrow for the resulting head before review, merge, warning maintenance, or another embodiment",
  };
}
