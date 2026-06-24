import {
  compileVisibleRelease,
  type VisibleReleaseCompilerInput,
  type VisibleReleaseCompilerVerdict,
  type VisibleReleaseKind,
} from "./visible-release-compiler.js";

export type VisibleReleaseAdmissionAction = "admit_visible_release" | "block_visible_release";

export interface VisibleReleaseAdmissionInput {
  expected_repository_full_name: string;
  expected_pr_number: number;
  active_branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  visible_output: string[];
  compiler_input: VisibleReleaseCompilerInput;
}

export interface VisibleReleaseAdmissionVerdict {
  ok: boolean;
  action: VisibleReleaseAdmissionAction;
  release_kind: VisibleReleaseKind;
  head_sha: string;
  visible_output: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function sameLines(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((line, index) => line === right[index]);
}

function visibleOutputBlockers(input: VisibleReleaseAdmissionInput, compiled: VisibleReleaseCompilerVerdict): string[] {
  const blockers: string[] = [];
  const joinedOutput = input.visible_output.join("\n").toLowerCase();

  if (!sameLines(input.visible_output, compiled.visible_lines)) {
    blockers.push("visible output does not exactly match compiled visible release lines");
  }

  if (joinedOutput.includes(input.repaired_head_sha.toLowerCase())) {
    blockers.push(`visible output repeats repaired head ${input.repaired_head_sha}`);
  }

  if (joinedOutput.includes("repaired-head") || joinedOutput.includes("status-readback blocker")) {
    blockers.push("visible output repeats the old repaired-head status-readback blocker class");
  }

  return blockers;
}

function boundaryBlockers(input: VisibleReleaseAdmissionInput): string[] {
  const compilerInput = input.compiler_input;
  const blockers: string[] = [];

  if (compilerInput.repository_full_name !== input.expected_repository_full_name) {
    blockers.push(`visible release repository ${compilerInput.repository_full_name} does not match active sink ${input.expected_repository_full_name}`);
  }

  if (compilerInput.pr_number !== input.expected_pr_number) {
    blockers.push(`visible release PR #${compilerInput.pr_number} does not match active PR #${input.expected_pr_number}`);
  }

  if (compilerInput.active_branch !== input.active_branch || compilerInput.branch !== input.active_branch) {
    blockers.push(`visible release is not bound to active branch ${input.active_branch}`);
  }

  if (compilerInput.live_head_sha !== input.live_head_sha) {
    blockers.push(`visible release live head ${compilerInput.live_head_sha} does not match current live head ${input.live_head_sha}`);
  }

  return blockers;
}

function headTransitionBlockers(input: VisibleReleaseAdmissionInput, compiled: VisibleReleaseCompilerVerdict): string[] {
  const blockers: string[] = [];
  const releaseKind = input.compiler_input.release_kind;

  if (releaseKind === "external_platform_embodiment" && compiled.head_sha === input.live_head_sha) {
    blockers.push("visible external embodiment did not move the live head");
  }

  if (releaseKind !== "external_platform_embodiment" && compiled.head_sha !== input.live_head_sha) {
    blockers.push("non-embodiment visible release cannot move the live head");
  }

  return blockers;
}

export function admitVisibleRelease(input: VisibleReleaseAdmissionInput): VisibleReleaseAdmissionVerdict {
  const compiled = compileVisibleRelease(input.compiler_input);
  const blockers = [
    ...boundaryBlockers(input),
    ...compiled.blockers,
    ...visibleOutputBlockers(input, compiled),
    ...headTransitionBlockers(input, compiled),
  ];

  if (!compiled.ok || blockers.length > 0) {
    return {
      ok: false,
      action: "block_visible_release",
      release_kind: input.compiler_input.release_kind,
      head_sha: compiled.head_sha,
      visible_output: [],
      decisive_evidence: compiled.decisive_evidence,
      blockers,
      next_route: "emit only the compiled visible release for the active PR head, or return one exact blocker",
    };
  }

  return {
    ok: true,
    action: "admit_visible_release",
    release_kind: input.compiler_input.release_kind,
    head_sha: compiled.head_sha,
    visible_output: compiled.visible_lines,
    decisive_evidence: compiled.decisive_evidence,
    blockers: [],
    next_route:
      input.compiler_input.release_kind === "external_platform_embodiment"
        ? `read status only for moved head ${compiled.head_sha} before making a status claim`
        : "continue only from the admitted visible release boundary",
  };
}
