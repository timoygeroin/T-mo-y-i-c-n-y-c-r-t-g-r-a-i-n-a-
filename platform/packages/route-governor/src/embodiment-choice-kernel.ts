export type EmbodimentChoiceClass =
  | "runtime_behavior"
  | "future_routing"
  | "proof_surface"
  | "status_readback"
  | "metadata_only"
  | "commentary_only";

export interface EmbodimentChoiceCandidate {
  candidate_id: string;
  changed_files: string[];
  executable_exports: string[];
  proof_artifacts: string[];
  routing_effects: string[];
  choice_classes: EmbodimentChoiceClass[];
  repeats_move_class?: string;
  depends_on_head_move?: boolean;
}

export interface EmbodimentChoiceInput {
  branch: string;
  live_head_sha: string;
  last_repaired_head_sha: string;
  exhausted_move_classes: string[];
  candidates: EmbodimentChoiceCandidate[];
}

export interface EmbodimentChoiceRejection {
  candidate_id: string;
  reasons: string[];
}

export interface EmbodimentChoiceSelection {
  candidate_id: string;
  score: number;
  decisive_evidence: string[];
}

export interface EmbodimentChoiceVerdict {
  ok: boolean;
  branch: string;
  head_sha: string;
  selected: EmbodimentChoiceSelection | null;
  rejected: EmbodimentChoiceRejection[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<EmbodimentChoiceClass>(["status_readback", "metadata_only", "commentary_only"]);
const REQUIRED_PROGRESS_CLASSES = new Set<EmbodimentChoiceClass>([
  "runtime_behavior",
  "future_routing",
  "proof_surface",
]);

function isExecutablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function scoreCandidate(candidate: EmbodimentChoiceCandidate): number {
  let score = 0;
  if (candidate.choice_classes.includes("runtime_behavior")) score += 5;
  if (candidate.choice_classes.includes("future_routing")) score += 4;
  if (candidate.choice_classes.includes("proof_surface")) score += 3;
  score += Math.min(candidate.executable_exports.length, 3);
  score += Math.min(candidate.routing_effects.length, 3);
  score += Math.min(candidate.proof_artifacts.length, 2);
  return score;
}

function rejectionReasons(input: EmbodimentChoiceInput, candidate: EmbodimentChoiceCandidate): string[] {
  const reasons: string[] = [];
  const progressClasses = candidate.choice_classes.filter((choiceClass) => REQUIRED_PROGRESS_CLASSES.has(choiceClass));
  const nonProgressClasses = candidate.choice_classes.filter((choiceClass) => NON_PROGRESS_CLASSES.has(choiceClass));

  if (candidate.repeats_move_class && input.exhausted_move_classes.includes(candidate.repeats_move_class)) {
    reasons.push(`candidate repeats exhausted move class: ${candidate.repeats_move_class}`);
  }

  if (candidate.depends_on_head_move && input.live_head_sha === input.last_repaired_head_sha) {
    reasons.push("candidate depends on a moved head, but the live head has not moved since repaired-head readback");
  }

  if (progressClasses.length === 0) {
    reasons.push("candidate has no runtime behavior, future routing, or proof-surface class");
  }

  if (nonProgressClasses.length > 0 && progressClasses.length === 0) {
    reasons.push(`candidate is non-progress only: ${nonProgressClasses.join(", ")}`);
  }

  if (!candidate.changed_files.some(isExecutablePlatformPath)) {
    reasons.push("candidate does not change executable platform package files");
  }

  if (candidate.executable_exports.length === 0) {
    reasons.push("candidate has no executable export evidence");
  }

  if (candidate.proof_artifacts.length === 0) {
    reasons.push("candidate has no proof artifact evidence");
  }

  if (candidate.routing_effects.length === 0) {
    reasons.push("candidate has no future-routing effect evidence");
  }

  return reasons;
}

export function chooseNextEmbodiment(input: EmbodimentChoiceInput): EmbodimentChoiceVerdict {
  const rejected: EmbodimentChoiceRejection[] = [];
  const selectable: EmbodimentChoiceSelection[] = [];

  for (const candidate of input.candidates) {
    const reasons = rejectionReasons(input, candidate);
    if (reasons.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id, reasons });
      continue;
    }

    selectable.push({
      candidate_id: candidate.candidate_id,
      score: scoreCandidate(candidate),
      decisive_evidence: [
        ...candidate.changed_files.filter(isExecutablePlatformPath),
        ...candidate.executable_exports,
        ...candidate.routing_effects,
        ...candidate.proof_artifacts,
      ],
    });
  }

  selectable.sort((left, right) => right.score - left.score || left.candidate_id.localeCompare(right.candidate_id));
  const selected = selectable[0] ?? null;

  return {
    ok: selected !== null,
    branch: input.branch,
    head_sha: input.live_head_sha,
    selected,
    rejected,
    next_route: selected
      ? "commit the selected executable embodiment increment, then bind any status claim to the new head"
      : "emit one exact external blocker: no executable embodiment candidate survived choice pressure",
  };
}
