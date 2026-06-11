import type { LiveHeadChoiceVerdict } from "./live-head-choice-reconciliation.js";

export type LiveHeadChoiceAdmissionAction =
  | "admit_embodiment_commit"
  | "admit_failure_repair"
  | "require_live_status"
  | "block_stale_or_nonexecutable_choice";

export interface LiveHeadChoiceAdmissionInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  verdict: LiveHeadChoiceVerdict;
  required_stale_source_ids: string[];
}

export interface LiveHeadChoiceAdmissionVerdict {
  ok: boolean;
  action: LiveHeadChoiceAdmissionAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: LiveHeadChoiceAdmissionInput): Pick<LiveHeadChoiceAdmissionVerdict, "branch" | "head_sha"> {
  return { branch: input.branch, head_sha: input.live_head_sha };
}

function block(input: LiveHeadChoiceAdmissionInput, blockers: string[], nextRoute: string): LiveHeadChoiceAdmissionVerdict {
  return {
    ...base(input),
    ok: false,
    action: "block_stale_or_nonexecutable_choice",
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function missingRequiredStaleSources(input: LiveHeadChoiceAdmissionInput): string[] {
  return input.required_stale_source_ids.filter((sourceId) => !input.verdict.stale_source_ids.includes(sourceId));
}

export function admitLiveHeadChoice(input: LiveHeadChoiceAdmissionInput): LiveHeadChoiceAdmissionVerdict {
  const blockers: string[] = [];
  if (input.branch !== input.active_branch) {
    blockers.push(`choice admission branch ${input.branch} does not match active branch ${input.active_branch}`);
  }
  if (input.verdict.branch !== input.branch) {
    blockers.push(`choice verdict branch ${input.verdict.branch} does not match admission branch ${input.branch}`);
  }
  if (input.verdict.head_sha !== input.live_head_sha) {
    blockers.push(`choice verdict belongs to ${input.verdict.head_sha}, not live head ${input.live_head_sha}`);
  }

  const missingStaleSources = missingRequiredStaleSources(input);
  if (missingStaleSources.length > 0) {
    blockers.push(`required stale source ids were not retired: ${missingStaleSources.join(", ")}`);
  }

  if (blockers.length > 0) {
    return block(input, blockers, "re-run live-head choice reconciliation from the active PR head before admission");
  }

  if (input.verdict.action === "repair_live_head_failure") {
    if (input.verdict.blockers.length === 0) {
      return block(input, ["live-head failure repair has no concrete failure evidence"], "surface the live-head failure before repair admission");
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_failure_repair",
      decisive_evidence: input.verdict.blockers,
      blockers: [],
      next_route: "repair the live-head-bound failure before selecting another embodiment increment",
    };
  }

  if (input.verdict.action === "read_live_head_status") {
    return {
      ...base(input),
      ok: false,
      action: "require_live_status",
      decisive_evidence: input.verdict.decisive_evidence,
      blockers: input.verdict.blockers.length > 0 ? input.verdict.blockers : ["live-head status must be read before embodiment admission"],
      next_route: "obtain a live-head status surface or wait for current checks to complete",
    };
  }

  if (!input.verdict.ok || input.verdict.action !== "select_executable_embodiment") {
    return block(
      input,
      input.verdict.blockers.length > 0 ? input.verdict.blockers : ["choice verdict did not select executable embodiment"],
      "supply an executable live-head embodiment candidate or emit the exact blocker",
    );
  }

  if (!input.verdict.selected_candidate_id) {
    return block(input, ["choice verdict selected embodiment without a candidate id"], "select a concrete executable candidate before admission");
  }

  if (input.verdict.decisive_evidence.length === 0) {
    return block(input, ["choice verdict has no decisive evidence"], "attach executable files, exports, proof artifacts, and routing effects");
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_embodiment_commit",
    decisive_evidence: [input.verdict.selected_candidate_id, ...input.verdict.decisive_evidence],
    blockers: [],
    next_route: "commit the admitted executable embodiment, then bind status readback to the moved head",
  };
}
