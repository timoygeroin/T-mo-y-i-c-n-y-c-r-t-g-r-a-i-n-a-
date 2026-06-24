import {
  admitRootExportSurface,
  type RootExportSurfaceAdmissionInput,
} from "./root-export-surface-admission.js";
import { consumeDownstreamAuthority } from "./index.js";
import "./downstream-authority-consumption-lease-proof.js";

function input(overrides: Partial<RootExportSurfaceAdmissionInput> = {}): RootExportSurfaceAdmissionInput {
  return {
    candidate_id: "root-export-surface-admission-proof",
    behavior_exports: ["admitRootExportSurface"],
    root_exports: ["admitRootExportSurface"],
    changed_files: ["platform/packages/route-governor/src/root-export-surface-admission.ts"],
    routing_effects: ["root-consumable behavior must be callable by downstream route packages"],
    ...overrides,
  };
}

function expectAction(name: string, action: string, expected: string): void {
  if (action !== expected) throw new Error(`${name} used ${action}, expected ${expected}`);
}

export function runRootExportSurfaceAdmissionProof(): void {
  const admitted = admitRootExportSurface(input());
  if (!admitted.ok) throw new Error(`root-consumable behavior should pass: ${admitted.blockers.join("; ")}`);
  expectAction("root-consumable behavior", admitted.action, "admit_root_consumable_behavior");

  const hidden = admitRootExportSurface(input({ root_exports: ["compileRouteProgressLedger"] }));
  if (hidden.ok) throw new Error("hidden behavior should block before release");
  expectAction("hidden behavior", hidden.action, "block_hidden_behavior");

  const proofOnly = admitRootExportSurface(
    input({ changed_files: ["platform/packages/route-governor/src/root-export-surface-admission-proof.ts"] }),
  );
  if (!proofOnly.ok) {
    throw new Error(`proof runner is still executable source and should be addressable: ${proofOnly.blockers.join("; ")}`);
  }

  const downstreamAuthority = admitRootExportSurface(
    input({
      candidate_id: "downstream-authority-consumption-lease-root-surface",
      behavior_exports: ["consumeDownstreamAuthority"],
      root_exports: ["consumeDownstreamAuthority"],
      changed_files: ["platform/packages/route-governor/src/downstream-authority-consumption-lease.ts"],
      routing_effects: ["downstream review and merge authority must consume a live-head status lease before release"],
    }),
  );
  if (!downstreamAuthority.ok) {
    throw new Error(`downstream authority lease should be root-consumable: ${downstreamAuthority.blockers.join("; ")}`);
  }
  if (typeof consumeDownstreamAuthority !== "function") {
    throw new Error("consumeDownstreamAuthority is not exported from the route-governor root surface");
  }

  const noRouting = admitRootExportSurface(input({ routing_effects: [] }));
  if (noRouting.ok) throw new Error("root exposure without routing effect should block");
  expectAction("missing routing effect", noRouting.action, "block_missing_routing_effect");
}

runRootExportSurfaceAdmissionProof();
