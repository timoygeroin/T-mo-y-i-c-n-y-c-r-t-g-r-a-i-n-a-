export type ProofManifestCoverageAction =
  | "accept_proof_manifest_coverage"
  | "repair_proof_manifest_coverage"
  | "block_branch_mismatch"
  | "block_empty_manifest";

export interface ProofManifestEntry {
  proof_id: string;
  source_path: string;
  proof_path: string;
  dist_command: string;
}

export interface ProofManifestCoverageInput {
  branch: string;
  active_branch: string;
  proof_command: string;
  manifest: ProofManifestEntry[];
  spent_proof_ids: string[];
}

export interface ProofManifestCoverageVerdict {
  ok: boolean;
  action: ProofManifestCoverageAction;
  branch: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function expectedDistCommand(proofPath: string): string {
  const distPath = proofPath
    .replace(/^platform\/packages\/route-governor\/src\//, "dist/")
    .replace(/\.ts$/, ".js");
  return `node ${distPath}`;
}

function entryLabel(entry: ProofManifestEntry): string {
  return `${entry.proof_id}:${entry.proof_path}`;
}

function entryBlockers(entry: ProofManifestEntry, proofCommand: string, spentProofIds: string[]): string[] {
  const blockers: string[] = [];
  const label = entry.proof_id || "<unknown>";

  if (!entry.proof_id.trim()) blockers.push("proof manifest entry has no proof id");
  if (!entry.source_path.trim()) blockers.push(`proof manifest entry ${label} has no source path`);
  if (!entry.proof_path.trim()) blockers.push(`proof manifest entry ${label} has no proof path`);
  if (!entry.dist_command.trim()) blockers.push(`proof manifest entry ${label} has no dist command`);

  if (entry.source_path && !entry.source_path.startsWith("platform/packages/route-governor/src/")) {
    blockers.push(`proof manifest entry ${label} source is outside route-governor src`);
  }
  if (entry.proof_path && !entry.proof_path.startsWith("platform/packages/route-governor/src/")) {
    blockers.push(`proof manifest entry ${label} proof is outside route-governor src`);
  }
  if (entry.proof_path && !entry.proof_path.endsWith("-proof.ts")) {
    blockers.push(`proof manifest entry ${label} proof path is not a proof file`);
  }
  if (entry.source_path && entry.proof_path && entry.proof_path !== entry.source_path.replace(/\.ts$/, "-proof.ts")) {
    blockers.push(`proof manifest entry ${label} proof path does not match source path`);
  }
  if (entry.proof_path && entry.dist_command !== expectedDistCommand(entry.proof_path)) {
    blockers.push(`proof manifest entry ${label} dist command does not match proof path`);
  }
  if (entry.dist_command && !proofCommand.includes(entry.dist_command)) {
    blockers.push(`proof command does not execute ${entry.dist_command}`);
  }
  if (spentProofIds.includes(entry.proof_id)) {
    blockers.push(`proof manifest id already spent: ${entry.proof_id}`);
  }

  return blockers;
}

export function compileProofManifestCoverage(input: ProofManifestCoverageInput): ProofManifestCoverageVerdict {
  if (input.branch !== input.active_branch) {
    return {
      ok: false,
      action: "block_branch_mismatch",
      branch: input.branch,
      decisive_evidence: [],
      blockers: [`proof manifest branch ${input.branch} does not match active branch ${input.active_branch}`],
      next_route: "bind proof manifest coverage to the active manifestation branch before release",
    };
  }

  if (input.manifest.length === 0) {
    return {
      ok: false,
      action: "block_empty_manifest",
      branch: input.branch,
      decisive_evidence: [],
      blockers: ["proof manifest has no proof entries"],
      next_route: "add proof entries before trusting the package proof command",
    };
  }

  const blockers: string[] = [];
  const decisiveEvidence: string[] = [];
  const seenProofIds = new Set<string>();

  for (const entry of input.manifest) {
    if (seenProofIds.has(entry.proof_id)) {
      blockers.push(`proof manifest id is duplicated: ${entry.proof_id}`);
    }
    seenProofIds.add(entry.proof_id);
    blockers.push(...entryBlockers(entry, input.proof_command, input.spent_proof_ids));
    decisiveEvidence.push(entryLabel(entry), entry.dist_command);
  }

  if (blockers.length > 0) {
    return {
      ok: false,
      action: "repair_proof_manifest_coverage",
      branch: input.branch,
      decisive_evidence: decisiveEvidence,
      blockers,
      next_route: "wire every manifest proof into the package proof command before counting proof coverage",
    };
  }

  return {
    ok: true,
    action: "accept_proof_manifest_coverage",
    branch: input.branch,
    decisive_evidence: decisiveEvidence,
    blockers: [],
    next_route: "future proof files must enter the manifest and package proof command before release",
  };
}
