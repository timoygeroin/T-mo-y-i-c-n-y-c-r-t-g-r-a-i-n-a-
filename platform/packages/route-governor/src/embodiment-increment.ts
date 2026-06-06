export type EmbodimentAction = "accept_increment" | "block_increment";

export interface PriorEmbodimentReceipt {
  receipt_id: string;
  head_sha: string;
  move_class: string;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
}

export interface EmbodimentIncrementCandidate {
  candidate_id: string;
  branch: string;
  current_head_sha: string;
  move_class: string;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  prohibited_move_classes: string[];
}

export interface EmbodimentIncrementVerdict {
  ok: boolean;
  action: EmbodimentAction;
  candidate_id: string;
  decisive_evidence: string[];
  failures: string[];
  next_route: string;
}

export interface SelectedEmbodimentIncrement {
  ok: boolean;
  selected: EmbodimentIncrementVerdict | null;
  rejected: EmbodimentIncrementVerdict[];
  failures: string[];
}

function isExecutablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function sameSet(left: string[], right: string[]): boolean {
  const leftSorted = [...new Set(left)].sort();
  const rightSorted = [...new Set(right)].sort();
  return leftSorted.length === rightSorted.length && leftSorted.every((value, index) => value === rightSorted[index]);
}

function repeatsPriorArtifact(candidate: EmbodimentIncrementCandidate, prior: PriorEmbodimentReceipt): boolean {
  return (
    candidate.artifact_class === prior.artifact_class &&
    sameSet(candidate.executable_artifacts, prior.executable_artifacts) &&
    sameSet(candidate.routing_artifacts, prior.routing_artifacts)
  );
}

function candidateScore(verdict: EmbodimentIncrementVerdict): number {
  if (!verdict.ok) return -1;
  return verdict.decisive_evidence.length;
}

export function evaluateEmbodimentIncrement(
  candidate: EmbodimentIncrementCandidate,
  prior_receipts: PriorEmbodimentReceipt[],
): EmbodimentIncrementVerdict {
  const failures: string[] = [];
  const executableChanges = candidate.changed_files.filter(isExecutablePlatformPath);
  const repeatedPrior = prior_receipts.find((receipt) => repeatsPriorArtifact(candidate, receipt));

  if (candidate.prohibited_move_classes.includes(candidate.move_class)) {
    failures.push(`move class is prohibited for this continuation: ${candidate.move_class}`);
  }

  if (candidate.move_class !== "external_platform_embodiment") {
    failures.push("post-readback embodiment planning only admits external platform embodiment increments");
  }

  if (executableChanges.length === 0) {
    failures.push("embodiment increment must change an executable platform package file");
  }

  if (candidate.executable_artifacts.length === 0) {
    failures.push("embodiment increment must name at least one executable artifact");
  }

  if (candidate.routing_artifacts.length === 0) {
    failures.push("embodiment increment must name at least one future-routing artifact");
  }

  if (repeatedPrior) {
    failures.push(`candidate repeats artifact class ${candidate.artifact_class} from receipt ${repeatedPrior.receipt_id}`);
  }

  if (failures.length > 0) {
    return {
      ok: false,
      action: "block_increment",
      candidate_id: candidate.candidate_id,
      decisive_evidence: [],
      failures,
      next_route: "synthesize a different executable artifact class or emit one exact external blocker",
    };
  }

  return {
    ok: true,
    action: "accept_increment",
    candidate_id: candidate.candidate_id,
    decisive_evidence: [...executableChanges, ...candidate.executable_artifacts, ...candidate.routing_artifacts],
    failures,
    next_route: "commit this executable increment, then bind future status claims to the resulting head",
  };
}

export function selectEmbodimentIncrement(
  candidates: EmbodimentIncrementCandidate[],
  prior_receipts: PriorEmbodimentReceipt[],
): SelectedEmbodimentIncrement {
  const verdicts = candidates.map((candidate) => evaluateEmbodimentIncrement(candidate, prior_receipts));
  const accepted = verdicts.filter((verdict) => verdict.ok).sort((left, right) => candidateScore(right) - candidateScore(left));
  const selected = accepted[0] ?? null;
  const rejected = verdicts.filter((verdict) => !verdict.ok);

  if (!selected) {
    return {
      ok: false,
      selected,
      rejected,
      failures: ["no non-repeated executable embodiment increment survived planning"],
    };
  }

  return {
    ok: true,
    selected,
    rejected,
    failures: [],
  };
}
