import { compileExternalEmbodimentReceipt, type ExternalEmbodimentReceiptInput } from "./external-embodiment-receipt.js";

const branch = "monday-platform-genesis-01";

function input(overrides: Partial<ExternalEmbodimentReceiptInput> = {}): ExternalEmbodimentReceiptInput {
  return {
    branch,
    active_branch: branch,
    previous_head_sha: "da8bc82a63443240c9479d8447530e0040a2663b",
    new_head_sha: "next-head",
    move_class: "external_platform_embodiment",
    changed_files: [
      "platform/packages/route-governor/src/external-embodiment-receipt.ts",
      "platform/packages/route-governor/src/external-embodiment-receipt-proof.ts",
      "platform/packages/route-governor/src/external-embodiment-receipt.test.ts",
      "platform/packages/route-governor/package.json",
      "platform/packages/route-governor/src/proof-chain-proof.ts",
    ],
    executable_artifacts: ["compileExternalEmbodimentReceipt"],
    routing_artifacts: ["moved-head embodiment receipts must route next into new-head status readback"],
    spent_move_classes: [],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runExternalEmbodimentReceiptProof(): void {
  const accepted = compileExternalEmbodimentReceipt(input());
  assert(accepted.ok, `embodiment receipt should be accepted: ${accepted.blockers.join("; ")}`);
  assert(accepted.action === "record_embodiment", `expected record_embodiment, got ${accepted.action}`);

  const staleStatus = compileExternalEmbodimentReceipt(
    input({
      attempted_status_surface: {
        head_sha: "da8bc82a63443240c9479d8447530e0040a2663b",
        verdict: "passing",
        evidence_ids: ["old-check"],
      },
    }),
  );
  assert(!staleStatus.ok, "status claims from the previous head must be blocked");
  assert(
    staleStatus.blockers.some((blocker) => blocker.includes("not new head")),
    "stale status blocker should name the head mismatch",
  );

  const noMovement = compileExternalEmbodimentReceipt(input({ new_head_sha: "da8bc82a63443240c9479d8447530e0040a2663b" }));
  assert(!noMovement.ok, "receipt must reject embodiment claims that do not move the PR head");

  const withStatus = compileExternalEmbodimentReceipt(
    input({
      attempted_status_surface: {
        head_sha: "next-head",
        verdict: "passing_with_warnings",
        evidence_ids: ["27049651467"],
      },
    }),
  );
  assert(withStatus.ok, `new-head status should be accepted: ${withStatus.blockers.join("; ")}`);
  assert(withStatus.action === "record_embodiment_with_status", `expected record_embodiment_with_status, got ${withStatus.action}`);
}

runExternalEmbodimentReceiptProof();
