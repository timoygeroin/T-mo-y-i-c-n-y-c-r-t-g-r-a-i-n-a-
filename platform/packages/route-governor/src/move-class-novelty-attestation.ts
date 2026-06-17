export type NoveltyVector =
  | "behavior_surface"
  | "routing_consequence"
  | "source_authority"
  | "status_authority"
  | "release_geometry";

export type NoveltyAttestationAction =
  | "admit_novel_move_class"
  | "block_spent_move_class"
  | "block_stale_base_head"
  | "block_proof_only_novelty"
  | "block_missing_novelty_vector";

export interface SpentMoveClassReceipt {
  receipt_id: string;
  head_sha: string;
  move_class: string;
  artifact_class: string;
  novelty_vectors: NoveltyVector[];
  behavior_files: string[];
  routing_artifacts: string[];
}

export interface MoveClassNoveltyCandidate {
  candidate_id: string;
  branch: string;
  base_head_sha: string;
  move_class: string;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  novelty_vectors: NoveltyVector[];
  novelty_claim: string;
}

export interface MoveClassNoveltyInput {
  active_branch: string;
  live_head_sha: string;
  spent_move_classes: string[];
  spent_artifact_classes: string[];
  prior_receipts: SpentMoveClassReceipt[];
  candidate: MoveClassNoveltyCandidate;
}

export interface MoveClassNoveltyVerdict {
  ok: boolean;
  action: NoveltyAttestationAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function vectorKey(vectors: NoveltyVector[]): string {
  return [...new Set(vectors)].sort().join("|");
}

function overlaps(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function base(input: MoveClassNoveltyInput): Pick<MoveClassNoveltyVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function block(
  input: MoveClassNoveltyInput,
  action: Exclude<NoveltyAttestationAction, "admit_novel_move_class">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): MoveClassNoveltyVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function repeatedReceipt(input: MoveClassNoveltyInput): SpentMoveClassReceipt | undefined {
  const candidate = input.candidate;
  const candidateVectors = vectorKey(candidate.novelty_vectors);

  return input.prior_receipts.find((receipt) => {
    const sameMoveOrArtifact = receipt.move_class === candidate.move_class || receipt.artifact_class === candidate.artifact_class;
    const sameVectors = vectorKey(receipt.novelty_vectors) === candidateVectors;
    const sameBehavior = overlaps(receipt.behavior_files, candidate.changed_files.filter(executablePlatformPath));
    const sameRouting = overlaps(receipt.routing_artifacts, candidate.routing_artifacts);

    return sameMoveOrArtifact && sameVectors && (sameBehavior || sameRouting);
  });
}

function candidateBlockers(candidate: MoveClassNoveltyCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("novelty candidate has no candidate id");
  if (!candidate.novelty_claim.trim()) blockers.push("novelty candidate has no novelty claim");
  if (candidate.novelty_vectors.length === 0) blockers.push("novelty candidate has no novelty vector");
  if (candidate.executable_artifacts.length === 0) blockers.push("novelty candidate has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("novelty candidate has no routing consequence evidence");
  if (executableChanges.length === 0) blockers.push("novelty candidate changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("novelty candidate is proof-only and has no behavior-bearing executable file");
  }

  return blockers;
}

export function attestMoveClassNovelty(input: MoveClassNoveltyInput): MoveClassNoveltyVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_stale_base_head",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the novelty attestation to the active manifestation branch before release",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_base_head",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the novelty candidate to the live PR head before admitting it",
    );
  }

  const blockers = candidateBlockers(candidate);
  if (blockers.includes("novelty candidate has no novelty vector")) {
    return block(
      input,
      "block_missing_novelty_vector",
      blockers,
      "name the fresh novelty vector before claiming a non-repeated move class",
    );
  }

  if (blockers.some((entry) => entry.includes("proof-only"))) {
    return block(
      input,
      "block_proof_only_novelty",
      blockers,
      "add behavior-bearing executable code before proof artifacts can support novelty",
    );
  }

  if (blockers.length > 0) {
    return block(
      input,
      "block_missing_novelty_vector",
      blockers,
      "complete executable, routing, and claim evidence before novelty attestation",
    );
  }

  if (input.spent_move_classes.includes(candidate.move_class)) {
    return block(
      input,
      "block_spent_move_class",
      [`move class is already spent: ${candidate.move_class}`],
      "choose a different move class, not sharper wording of the spent class",
      [candidate.move_class],
    );
  }

  if (input.spent_artifact_classes.includes(candidate.artifact_class)) {
    return block(
      input,
      "block_spent_move_class",
      [`artifact class is already spent: ${candidate.artifact_class}`],
      "choose a different artifact class before claiming embodiment progress",
      [candidate.artifact_class],
    );
  }

  const repeated = repeatedReceipt(input);
  if (repeated) {
    return block(
      input,
      "block_spent_move_class",
      [`candidate repeats prior novelty surface from receipt ${repeated.receipt_id}`],
      "change the behavior surface, routing consequence, or novelty vector before release",
      [repeated.receipt_id, repeated.move_class, repeated.artifact_class],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_novel_move_class",
    decisive_evidence: unique([
      candidate.candidate_id,
      candidate.move_class,
      candidate.artifact_class,
      ...candidate.novelty_vectors,
      ...candidate.changed_files.filter(executablePlatformPath).filter((path) => !proofOnlyPath(path)),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      candidate.novelty_claim,
    ]),
    blockers: [],
    next_route: "release the embodiment only through this attested novelty surface, then record the new spent move class",
  };
}
