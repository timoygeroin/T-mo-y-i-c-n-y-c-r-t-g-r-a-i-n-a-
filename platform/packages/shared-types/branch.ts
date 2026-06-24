export interface BranchWorkItem {
  branch_id: string;
  job: string;
  evidence_scope: {
    source_refs: string[];
    source_tiers: Array<"raw" | "direct_archive" | "archive_derived" | "summary_derived" | "inferred">;
    shard_axis?: string;
  };
  processor_assignment: string[];
  success_test: string;
  artifact_type: string;
}
