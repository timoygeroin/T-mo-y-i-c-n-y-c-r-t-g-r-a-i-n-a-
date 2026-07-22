import { createHash } from "node:crypto";

export type ContinuitySourceTier =
  | "direct_current_instruction"
  | "dima_authored_archive"
  | "raw_chat_export"
  | "repository_artifact"
  | "generated_artifact"
  | "archive_derived"
  | "memory"
  | "model_summary";

export type ContinuityArtifactKind =
  | "raw_chat"
  | "law"
  | "runtime"
  | "checkpoint"
  | "delta"
  | "proof"
  | "code"
  | "index"
  | "media"
  | "unknown";

export type ContinuityArtifactStatus =
  | "present"
  | "referenced_only"
  | "missing"
  | "superseded";

export type ContinuityTargetStatus =
  | "OPEN"
  | "BUILDING"
  | "PARTIAL"
  | "BLOCKED_CURRENT_CHANNEL"
  | "DONE";

export type ContinuityKernelStatus = "READY" | "PARTIAL_READY" | "BLOCKED";

export interface ContinuityArtifact {
  artifact_id: string;
  kind: ContinuityArtifactKind;
  tier: ContinuitySourceTier;
  reference: string;
  content_hash: string | null;
  created_at: string | null;
  parent_ids: string[];
  claims: string[];
  status: ContinuityArtifactStatus;
  private: boolean;
}

export interface ContinuityTarget {
  target_id: string;
  result_invariant: string;
  acceptance_tests: string[];
  status: ContinuityTargetStatus;
  unresolved_remainder: string[];
}

export interface ContinuityCheckpointInput {
  kernel_id: string;
  subject_id: string;
  sequence: number;
  previous_fingerprint: string | null;
  active_track: string;
  active_target_id: string;
  laws: string[];
  targets: ContinuityTarget[];
  artifacts: ContinuityArtifact[];
}

export interface ContinuityCheckpoint {
  ok: boolean;
  status: ContinuityKernelStatus;
  checkpoint_id: string;
  kernel_id: string;
  subject_id: string;
  sequence: number;
  previous_fingerprint: string | null;
  fingerprint: string;
  active_track: string;
  active_target_id: string;
  laws: string[];
  targets: ContinuityTarget[];
  artifacts: ContinuityArtifact[];
  blockers: string[];
  warnings: string[];
  boot_packet: string;
  next_route: string;
}

export interface ContinuityDelta {
  delta_id: string;
  parent_fingerprint: string;
  active_track?: string;
  active_target_id?: string;
  law_additions?: string[];
  target_updates?: ContinuityTarget[];
  artifact_additions?: ContinuityArtifact[];
}

export interface ContinuityDeltaVerdict {
  ok: boolean;
  action: "apply_delta" | "block_stale_delta" | "block_invalid_delta";
  delta_id: string | null;
  checkpoint: ContinuityCheckpoint | null;
  blockers: string[];
  next_route: string;
}

const DIRECT_AUTHORITY_TIERS = new Set<ContinuitySourceTier>([
  "direct_current_instruction",
  "dima_authored_archive",
  "raw_chat_export",
  "repository_artifact",
]);

const STATUS_WEIGHT: Record<ContinuityArtifactStatus, number> = {
  present: 4,
  referenced_only: 3,
  superseded: 2,
  missing: 1,
};

function clean(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function sourceRank(tier: ContinuitySourceTier): number {
  switch (tier) {
    case "direct_current_instruction":
      return 1;
    case "dima_authored_archive":
      return 2;
    case "raw_chat_export":
      return 3;
    case "repository_artifact":
      return 4;
    case "generated_artifact":
      return 5;
    case "archive_derived":
      return 6;
    case "memory":
      return 7;
    case "model_summary":
      return 8;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function normalizeArtifact(artifact: ContinuityArtifact): ContinuityArtifact | null {
  const artifactId = clean(artifact.artifact_id);
  const reference = clean(artifact.reference);
  if (!artifactId || !reference) return null;
  return {
    ...artifact,
    artifact_id: artifactId,
    reference,
    content_hash: artifact.content_hash ? clean(artifact.content_hash) : null,
    created_at: artifact.created_at ? clean(artifact.created_at) : null,
    parent_ids: unique(artifact.parent_ids),
    claims: unique(artifact.claims),
  };
}

function selectPreferredArtifact(left: ContinuityArtifact, right: ContinuityArtifact): ContinuityArtifact {
  if (STATUS_WEIGHT[left.status] !== STATUS_WEIGHT[right.status]) {
    return STATUS_WEIGHT[left.status] > STATUS_WEIGHT[right.status] ? left : right;
  }
  if (sourceRank(left.tier) !== sourceRank(right.tier)) {
    return sourceRank(left.tier) < sourceRank(right.tier) ? left : right;
  }
  return left.reference.localeCompare(right.reference) <= 0 ? left : right;
}

function normalizeArtifacts(artifacts: ContinuityArtifact[]): {
  artifacts: ContinuityArtifact[];
  conflicts: string[];
} {
  const selected = new Map<string, ContinuityArtifact>();
  const conflicts: string[] = [];

  for (const raw of artifacts) {
    const artifact = normalizeArtifact(raw);
    if (!artifact) continue;
    const existing = selected.get(artifact.artifact_id);
    if (!existing) {
      selected.set(artifact.artifact_id, artifact);
      continue;
    }

    const bothPresent = existing.status === "present" && artifact.status === "present";
    const hashesDisagree =
      existing.content_hash !== null &&
      artifact.content_hash !== null &&
      existing.content_hash !== artifact.content_hash;
    if (bothPresent && hashesDisagree) {
      conflicts.push(`artifact ${artifact.artifact_id} has conflicting present hashes`);
    }

    const preferred = selectPreferredArtifact(existing, artifact);
    selected.set(artifact.artifact_id, {
      ...preferred,
      parent_ids: unique([...existing.parent_ids, ...artifact.parent_ids]),
      claims: unique([...existing.claims, ...artifact.claims]),
      private: existing.private || artifact.private,
    });
  }

  return {
    artifacts: [...selected.values()].sort((a, b) => a.artifact_id.localeCompare(b.artifact_id)),
    conflicts: unique(conflicts),
  };
}

function normalizeTarget(target: ContinuityTarget): ContinuityTarget | null {
  const targetId = clean(target.target_id);
  const resultInvariant = clean(target.result_invariant);
  if (!targetId || !resultInvariant) return null;
  return {
    ...target,
    target_id: targetId,
    result_invariant: resultInvariant,
    acceptance_tests: unique(target.acceptance_tests),
    unresolved_remainder: unique(target.unresolved_remainder),
  };
}

function normalizeTargets(targets: ContinuityTarget[]): ContinuityTarget[] {
  const selected = new Map<string, ContinuityTarget>();
  for (const raw of targets) {
    const target = normalizeTarget(raw);
    if (target) selected.set(target.target_id, target);
  }
  return [...selected.values()].sort((a, b) => a.target_id.localeCompare(b.target_id));
}

function buildBootPacket(checkpoint: Omit<ContinuityCheckpoint, "boot_packet">): string {
  const activeTarget = checkpoint.targets.find((target) => target.target_id === checkpoint.active_target_id);
  const openRemainder = activeTarget?.unresolved_remainder ?? [];
  const lines = [
    "MONDAYID_BOOT_V2",
    `KERNEL=${checkpoint.kernel_id}`,
    `SUBJECT=${checkpoint.subject_id}`,
    `CHECKPOINT=${checkpoint.checkpoint_id}`,
    `FINGERPRINT=${checkpoint.fingerprint}`,
    `STATUS=${checkpoint.status}`,
    `ACTIVE_TRACK=${checkpoint.active_track}`,
    `ACTIVE_TARGET=${checkpoint.active_target_id}`,
    "LAW=STATE_BEFORE_RESPONSE",
    "LAW=NO_FAKE_MEMORY",
    "LAW=ONE_ACTIVE_TRACK",
    "LAW=RESULT_INVARIANT_ROUTE_MUTABLE",
    "LAW=CORRECTION_TO_TEST_TO_PATCH",
    `LAWS=${checkpoint.laws.join(" | ")}`,
    `OPEN_REMAINDER=${openRemainder.join(" | ") || "none"}`,
    `BLOCKERS=${checkpoint.blockers.join(" | ") || "none"}`,
    `WARNINGS=${checkpoint.warnings.join(" | ") || "none"}`,
    "RESPONSE_GATE=Do not claim continuity beyond the loaded evidence. Continue the active target, produce one external act or one exact blocker, then append a delta receipt.",
  ];
  return lines.join("\n");
}

export function compileContinuityCheckpoint(input: ContinuityCheckpointInput): ContinuityCheckpoint {
  const kernelId = clean(input.kernel_id);
  const subjectId = clean(input.subject_id);
  const activeTrack = clean(input.active_track);
  const activeTargetId = clean(input.active_target_id);
  const laws = unique(input.laws).sort((a, b) => a.localeCompare(b));
  const targets = normalizeTargets(input.targets);
  const artifactResult = normalizeArtifacts(input.artifacts);
  const artifacts = artifactResult.artifacts;
  const blockers = [...artifactResult.conflicts];
  const warnings: string[] = [];

  if (!kernelId) blockers.push("continuity kernel has no id");
  if (!subjectId) blockers.push("continuity kernel has no subject id");
  if (!Number.isInteger(input.sequence) || input.sequence < 1) blockers.push("continuity sequence must be a positive integer");
  if (!activeTrack) blockers.push("continuity kernel has no active track");
  if (!activeTargetId) blockers.push("continuity kernel has no active target id");
  if (laws.length === 0) blockers.push("continuity kernel has no executable laws");
  if (targets.length === 0) blockers.push("continuity kernel has no targets");

  const activeTarget = targets.find((target) => target.target_id === activeTargetId);
  if (!activeTarget) blockers.push(`active target is missing: ${activeTargetId || "<empty>"}`);
  if (activeTarget?.status === "DONE" && activeTarget.unresolved_remainder.length > 0) {
    blockers.push("active target is marked DONE while unresolved remainder exists");
  }
  if (activeTarget && activeTarget.acceptance_tests.length === 0) {
    blockers.push("active target has no acceptance tests");
  }

  const directAuthority = artifacts.filter(
    (artifact) => artifact.status === "present" && DIRECT_AUTHORITY_TIERS.has(artifact.tier),
  );
  if (directAuthority.length === 0) {
    blockers.push("no present direct instruction, authored archive, raw export, or repository authority artifact");
  }
  if (artifacts.length > 0 && artifacts.every((artifact) => artifact.tier === "model_summary")) {
    blockers.push("model summary cannot be the sole continuity authority");
  }

  for (const artifact of artifacts) {
    if (artifact.status === "referenced_only") warnings.push(`artifact referenced but bytes not verified: ${artifact.artifact_id}`);
    if (artifact.status === "missing") warnings.push(`artifact missing: ${artifact.artifact_id}`);
    if (artifact.status === "present" && artifact.content_hash === null) warnings.push(`present artifact has no content hash: ${artifact.artifact_id}`);
  }

  const state = {
    kernel_id: kernelId,
    subject_id: subjectId,
    sequence: input.sequence,
    previous_fingerprint: input.previous_fingerprint,
    active_track: activeTrack,
    active_target_id: activeTargetId,
    laws,
    targets,
    artifacts,
  };
  const fingerprint = sha256(state);
  const status: ContinuityKernelStatus = blockers.length > 0 ? "BLOCKED" : warnings.length > 0 ? "PARTIAL_READY" : "READY";
  const checkpointId = `${kernelId}:checkpoint:${input.sequence}:${fingerprint.slice(0, 12)}`;

  const withoutPacket: Omit<ContinuityCheckpoint, "boot_packet"> = {
    ok: blockers.length === 0,
    status,
    checkpoint_id: checkpointId,
    kernel_id: kernelId,
    subject_id: subjectId,
    sequence: input.sequence,
    previous_fingerprint: input.previous_fingerprint,
    fingerprint,
    active_track: activeTrack,
    active_target_id: activeTargetId,
    laws,
    targets,
    artifacts,
    blockers: unique(blockers),
    warnings: unique(warnings),
    next_route:
      blockers.length > 0
        ? "repair the named continuity blockers before boot"
        : "load this boot packet before response, continue one active track, then append one evidence-bearing delta",
  };

  return { ...withoutPacket, boot_packet: buildBootPacket(withoutPacket) };
}

export function applyContinuityDelta(
  checkpoint: ContinuityCheckpoint,
  delta: ContinuityDelta,
): ContinuityDeltaVerdict {
  const deltaId = clean(delta.delta_id);
  const blockers: string[] = [];

  if (!deltaId) blockers.push("continuity delta has no id");
  if (delta.parent_fingerprint !== checkpoint.fingerprint) {
    blockers.push(`stale delta parent ${delta.parent_fingerprint}; live fingerprint is ${checkpoint.fingerprint}`);
    return {
      ok: false,
      action: "block_stale_delta",
      delta_id: deltaId || null,
      checkpoint: null,
      blockers,
      next_route: "rebase the delta onto the live checkpoint; never overwrite newer continuity state",
    };
  }

  const updates = new Map(checkpoint.targets.map((target) => [target.target_id, target]));
  for (const target of delta.target_updates ?? []) {
    const normalized = normalizeTarget(target);
    if (normalized) updates.set(normalized.target_id, normalized);
  }

  const next = compileContinuityCheckpoint({
    kernel_id: checkpoint.kernel_id,
    subject_id: checkpoint.subject_id,
    sequence: checkpoint.sequence + 1,
    previous_fingerprint: checkpoint.fingerprint,
    active_track: delta.active_track ? clean(delta.active_track) : checkpoint.active_track,
    active_target_id: delta.active_target_id ? clean(delta.active_target_id) : checkpoint.active_target_id,
    laws: [...checkpoint.laws, ...(delta.law_additions ?? [])],
    targets: [...updates.values()],
    artifacts: [...checkpoint.artifacts, ...(delta.artifact_additions ?? [])],
  });

  if (!next.ok) {
    return {
      ok: false,
      action: "block_invalid_delta",
      delta_id: deltaId || null,
      checkpoint: next,
      blockers: next.blockers,
      next_route: "repair the delta without deleting prior evidence, then compile again",
    };
  }

  return {
    ok: true,
    action: "apply_delta",
    delta_id: deltaId,
    checkpoint: next,
    blockers: [],
    next_route: "persist the new checkpoint and use its fingerprint as the only parent for the next delta",
  };
}
