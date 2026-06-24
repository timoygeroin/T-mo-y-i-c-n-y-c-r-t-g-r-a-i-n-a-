export interface ProofSurfaceWiringInput {
  proof_script: string;
  required_proof_files: string[];
  changed_proof_files: string[];
}

export interface ProofSurfaceWiringVerdict {
  ok: boolean;
  wired_proofs: string[];
  missing_proofs: string[];
  ignored_files: string[];
  blockers: string[];
  next_route: string;
}

function proofSourceToDistCommand(path: string): string | null {
  const normalized = path.replace(/^\.\//, "");
  const match = normalized.match(/^platform\/packages\/route-governor\/src\/(.+-proof)\.ts$/);
  if (!match) return null;
  return `node dist/${match[1]}.js`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function auditProofSurfaceWiring(input: ProofSurfaceWiringInput): ProofSurfaceWiringVerdict {
  const required = unique([...input.required_proof_files, ...input.changed_proof_files]);
  const wired_proofs: string[] = [];
  const missing_proofs: string[] = [];
  const ignored_files: string[] = [];

  for (const file of required) {
    const command = proofSourceToDistCommand(file);
    if (!command) {
      ignored_files.push(file);
      continue;
    }

    if (input.proof_script.includes(command)) {
      wired_proofs.push(file);
    } else {
      missing_proofs.push(file);
    }
  }

  const blockers = missing_proofs.map((file) => {
    const command = proofSourceToDistCommand(file);
    return `proof surface ${file} is not wired into proof:examples as ${command}`;
  });

  return {
    ok: blockers.length === 0,
    wired_proofs,
    missing_proofs,
    ignored_files,
    blockers,
    next_route:
      blockers.length === 0
        ? "proof surfaces are wired; continue to current-head status readback or next executable embodiment"
        : "wire every changed proof surface into proof:examples before counting proof-only additions as progress",
  };
}
