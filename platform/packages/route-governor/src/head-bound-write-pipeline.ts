import {
  admitHeadBoundCandidateNovelty,
  type HeadBoundCandidateNoveltyInput,
  type HeadBoundCandidateNoveltyVerdict,
} from "./head-bound-candidate-novelty.js";
import {
  compileAdmittedCandidateWriteReceipt,
  type AdmittedCandidateWriteReceiptInput,
  type AdmittedCandidateWriteReceiptVerdict,
} from "./admitted-candidate-write-receipt.js";
import {
  openPostWriteStatusEscrow,
  type PostWriteStatusEscrowInput,
  type PostWriteStatusEscrowVerdict,
} from "./post-write-status-escrow.js";

export type HeadBoundWritePipelineAction =
  | "open_head_bound_post_write_status_escrow"
  | "release_head_bound_post_write_status"
  | "block_pipeline_scope_mismatch"
  | "block_candidate_admission"
  | "block_write_receipt"
  | "block_post_write_status_escrow";

export interface HeadBoundWritePipelineInput {
  active_branch: string;
  live_head_sha: string;
  candidate: HeadBoundCandidateNoveltyInput;
  write: Omit<AdmittedCandidateWriteReceiptInput, "active_branch" | "admission">;
  escrow: Omit<
    PostWriteStatusEscrowInput,
    "active_branch" | "branch" | "base_head_sha" | "resulting_head_sha" | "write_receipt"
  > & {
    branch?: string;
  };
}

export interface HeadBoundWritePipelineVerdict {
  ok: boolean;
  action: HeadBoundWritePipelineAction;
  branch: string;
  base_head_sha: string;
  resulting_head_sha: string | null;
  candidate: HeadBoundCandidateNoveltyVerdict;
  write_receipt: AdmittedCandidateWriteReceiptVerdict | null;
  status_escrow: PostWriteStatusEscrowVerdict | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function block(
  input: HeadBoundWritePipelineInput,
  action: Exclude<
    HeadBoundWritePipelineAction,
    "open_head_bound_post_write_status_escrow" | "release_head_bound_post_write_status"
  >,
  candidate: HeadBoundCandidateNoveltyVerdict,
  writeReceipt: AdmittedCandidateWriteReceiptVerdict | null,
  statusEscrow: PostWriteStatusEscrowVerdict | null,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): HeadBoundWritePipelineVerdict {
  return {
    ok: false,
    action,
    branch: input.active_branch,
    base_head_sha: input.live_head_sha,
    resulting_head_sha: writeReceipt?.resulting_head_sha ?? null,
    candidate,
    write_receipt: writeReceipt,
    status_escrow: statusEscrow,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileHeadBoundWritePipeline(
  input: HeadBoundWritePipelineInput,
): HeadBoundWritePipelineVerdict {
  const scopeBlockers: string[] = [];
  if (input.candidate.active_branch !== input.active_branch) {
    scopeBlockers.push(`candidate active branch ${input.candidate.active_branch} does not match ${input.active_branch}`);
  }
  if (input.candidate.live_head_sha !== input.live_head_sha) {
    scopeBlockers.push(`candidate live head ${input.candidate.live_head_sha} does not match ${input.live_head_sha}`);
  }

  const candidate = admitHeadBoundCandidateNovelty(input.candidate);
  if (scopeBlockers.length > 0) {
    return block(
      input,
      "block_pipeline_scope_mismatch",
      candidate,
      null,
      null,
      scopeBlockers,
      "rebuild the candidate admission input from the pipeline active branch and live head",
      candidate.decisive_evidence,
    );
  }

  if (!candidate.ok) {
    return block(
      input,
      "block_candidate_admission",
      candidate,
      null,
      null,
      candidate.blockers,
      "admit a branch/head-bound novel candidate before accepting any write receipt",
      candidate.decisive_evidence,
    );
  }

  const writeReceipt = compileAdmittedCandidateWriteReceipt({
    active_branch: input.active_branch,
    admission: candidate,
    ...input.write,
  });

  if (!writeReceipt.ok) {
    return block(
      input,
      "block_write_receipt",
      candidate,
      writeReceipt,
      null,
      writeReceipt.blockers,
      "perform a real write that matches the admitted candidate before opening status escrow",
      [...candidate.decisive_evidence, ...writeReceipt.decisive_evidence],
    );
  }

  const statusEscrow = openPostWriteStatusEscrow({
    active_branch: input.active_branch,
    branch: input.escrow.branch ?? input.active_branch,
    base_head_sha: writeReceipt.base_head_sha,
    resulting_head_sha: writeReceipt.resulting_head_sha,
    write_receipt: {
      commit_sha: writeReceipt.resulting_head_sha,
      changed_files: input.write.changed_files,
      behavior_artifacts: input.write.behavior_artifacts,
      routing_artifacts: input.write.routing_artifacts,
    },
    ...input.escrow,
  });

  if (!statusEscrow.ok) {
    return block(
      input,
      "block_post_write_status_escrow",
      candidate,
      writeReceipt,
      statusEscrow,
      statusEscrow.blockers,
      statusEscrow.next_route,
      [...candidate.decisive_evidence, ...writeReceipt.decisive_evidence, ...statusEscrow.decisive_evidence],
    );
  }

  return {
    ok: true,
    action:
      statusEscrow.action === "release_head_bound_status"
        ? "release_head_bound_post_write_status"
        : "open_head_bound_post_write_status_escrow",
    branch: input.active_branch,
    base_head_sha: writeReceipt.base_head_sha,
    resulting_head_sha: writeReceipt.resulting_head_sha,
    candidate,
    write_receipt: writeReceipt,
    status_escrow: statusEscrow,
    decisive_evidence: [
      ...candidate.decisive_evidence,
      ...writeReceipt.decisive_evidence,
      ...statusEscrow.decisive_evidence,
    ],
    blockers: [],
    next_route: statusEscrow.next_route,
  };
}
