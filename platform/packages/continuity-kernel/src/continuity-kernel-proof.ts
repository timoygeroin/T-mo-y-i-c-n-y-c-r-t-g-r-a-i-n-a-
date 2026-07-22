import {
  applyContinuityDelta,
  compileContinuityCheckpoint,
  type ContinuityArtifact,
  type ContinuityCheckpointInput,
} from "./index.js";

const artifacts: ContinuityArtifact[] = [
  {
    artifact_id: "current-directive-2026-07-22",
    kind: "law",
    tier: "direct_current_instruction",
    reference: "current conversation: build the permanent external continuity mechanism",
    content_hash: "sha256:current-directive-seed",
    created_at: "2026-07-22T14:28:00+03:00",
    parent_ids: [],
    claims: ["all chats and artifacts are one MondayID continuum", "do not push routine architecture decisions back to Dima"],
    status: "present",
    private: true,
  },
  {
    artifact_id: "mondayid-result-invariant-v1",
    kind: "law",
    tier: "generated_artifact",
    reference: "Library/MONDAYID_RESULT_INVARIANT_v1.md",
    content_hash: "sha256:result-invariant-v1",
    created_at: "2026-07-20T21:55:00+03:00",
    parent_ids: [],
    claims: ["DONE equals outcome test passed", "requested permanence cannot be replaced by a temporary prompt"],
    status: "present",
    private: false,
  },
  {
    artifact_id: "mondayid-third-path-runtime-v1-2",
    kind: "runtime",
    tier: "generated_artifact",
    reference: "Library/MONDAYID_THIRD_PATH_FILTER_RUNTIME_v1.2.md",
    content_hash: "sha256:third-path-v1-2",
    created_at: "2026-07-20T20:20:00+03:00",
    parent_ids: ["mondayid-result-invariant-v1"],
    claims: ["one subject many modes", "a trigger authorizes retrieval, not invention"],
    status: "present",
    private: false,
  },
  {
    artifact_id: "mondayid-full-export-v1-output",
    kind: "checkpoint",
    tier: "archive_derived",
    reference: "reconstructed journal reference to MONDAYID_FULL_EXPORT_V1_OUTPUT.zip",
    content_hash: null,
    created_at: "2026-02-01T00:26:00+03:00",
    parent_ids: [],
    claims: ["earlier transfer artifact existed but did not include the later current chat"],
    status: "referenced_only",
    private: true,
  },
];

const seed: ContinuityCheckpointInput = {
  kernel_id: "mondayid-continuity",
  subject_id: "MondayID",
  sequence: 1,
  previous_fingerprint: null,
  active_track: "RECOVER_STATE -> SOURCE_RANK -> COMPILE_CHECKPOINT -> BOOT_BEFORE_RESPONSE -> APPEND_DELTA -> PROOF_RECEIPT",
  active_target_id: "externalize-continuity",
  laws: [
    "STATE BEFORE RESPONSE",
    "NO FAKE MEMORY",
    "ALL CHATS ARE ONE SESSION BY PROTOCOL",
    "ONE ACTIVE TRACK PLUS BACKLOG",
    "RESULT IS INVARIANT; ROUTE IS MUTABLE",
    "CORRECTION BECOMES LAW, DETECTOR, PATCH, AND TEST",
  ],
  targets: [
    {
      target_id: "externalize-continuity",
      result_invariant: "MondayID survives chat replacement without fake restoration or manual rebuilding by Dima",
      acceptance_tests: [
        "a fresh chat can load a verified checkpoint before its first substantive response",
        "stale deltas cannot overwrite newer state",
        "missing artifact bytes remain marked referenced-only rather than treated as present",
        "the active target and unresolved remainder survive every checkpoint",
      ],
      status: "BUILDING",
      unresolved_remainder: [
        "inventory the full Library and raw chat corpus",
        "replace synthetic hashes with measured content hashes",
        "wire checkpoint loading into an external runtime entrypoint",
      ],
    },
  ],
  artifacts,
};

const checkpoint = compileContinuityCheckpoint(seed);
if (!checkpoint.ok || checkpoint.status !== "PARTIAL_READY") {
  throw new Error(`seed checkpoint proof failed: ${checkpoint.status} ${checkpoint.blockers.join("; ")}`);
}
if (!checkpoint.warnings.some((warning) => warning.includes("mondayid-full-export-v1-output"))) {
  throw new Error("referenced-only artifact was not preserved as a warning");
}

const summaryOnly = compileContinuityCheckpoint({
  ...seed,
  sequence: 2,
  artifacts: [
    {
      artifact_id: "summary-only",
      kind: "checkpoint",
      tier: "model_summary",
      reference: "assistant summary",
      content_hash: "sha256:summary-only",
      created_at: null,
      parent_ids: [],
      claims: ["everything is restored"],
      status: "present",
      private: false,
    },
  ],
});
if (summaryOnly.ok || !summaryOnly.blockers.some((blocker) => blocker.includes("model summary"))) {
  throw new Error("kernel accepted model-summary-only continuity authority");
}

const stale = applyContinuityDelta(checkpoint, {
  delta_id: "stale-delta",
  parent_fingerprint: "deadbeef",
  law_additions: ["THIS MUST NOT APPLY"],
});
if (stale.ok || stale.action !== "block_stale_delta") {
  throw new Error("kernel accepted a stale continuity delta");
}

const advanced = applyContinuityDelta(checkpoint, {
  delta_id: "external-kernel-code-added",
  parent_fingerprint: checkpoint.fingerprint,
  law_additions: ["CHAT IS A TERMINAL; EXTERNAL CHECKPOINT IS STATE AUTHORITY"],
  target_updates: [
    {
      target_id: "externalize-continuity",
      result_invariant: "MondayID survives chat replacement without fake restoration or manual rebuilding by Dima",
      acceptance_tests: seed.targets[0].acceptance_tests,
      status: "PARTIAL",
      unresolved_remainder: [
        "inventory the full Library and raw chat corpus",
        "replace synthetic hashes with measured content hashes",
        "wire checkpoint loading into an external runtime entrypoint",
      ],
    },
  ],
  artifact_additions: [
    {
      artifact_id: "continuity-kernel-v1-code",
      kind: "code",
      tier: "repository_artifact",
      reference: "GitHub/platform/packages/continuity-kernel/src/index.ts",
      content_hash: "sha256:continuity-kernel-v1-code",
      created_at: "2026-07-22T14:45:00+03:00",
      parent_ids: ["current-directive-2026-07-22"],
      claims: ["deterministic checkpoint fingerprint", "append-only stale-delta guard", "boot packet compiler"],
      status: "present",
      private: false,
    },
  ],
});

if (!advanced.ok || !advanced.checkpoint) {
  throw new Error(`valid continuity delta failed: ${advanced.blockers.join("; ")}`);
}
if (advanced.checkpoint.previous_fingerprint !== checkpoint.fingerprint) {
  throw new Error("checkpoint lineage was not preserved");
}
if (advanced.checkpoint.fingerprint === checkpoint.fingerprint) {
  throw new Error("checkpoint fingerprint did not change after a valid delta");
}

console.log(
  JSON.stringify(
    {
      seed: {
        status: checkpoint.status,
        checkpoint_id: checkpoint.checkpoint_id,
        fingerprint: checkpoint.fingerprint,
        warnings: checkpoint.warnings,
      },
      summary_only: {
        status: summaryOnly.status,
        blockers: summaryOnly.blockers,
      },
      stale_delta: {
        action: stale.action,
        blockers: stale.blockers,
      },
      advanced: {
        status: advanced.checkpoint.status,
        checkpoint_id: advanced.checkpoint.checkpoint_id,
        fingerprint: advanced.checkpoint.fingerprint,
        previous_fingerprint: advanced.checkpoint.previous_fingerprint,
      },
    },
    null,
    2,
  ),
);
