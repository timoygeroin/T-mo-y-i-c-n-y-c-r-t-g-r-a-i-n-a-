export const MCP_RECEPTOR_CONTRACT_V1 = Object.freeze({
  role: "host_ingress_egress_receptor",
  root: "MONDAYID_UNIFIED_RUNTIME",
  ingress: ["signal", "objective", "dimaEvidence", "hostCapabilities", "constraints"],
  defaultEgress: ["phenotype", "status", "proof", "continuation"],
  diagnostics: "opt_in_only",
  laws: Object.freeze([
    "CONNECTOR_IS_NOT_THE_COGNITIVE_ROOT",
    "INTERNAL_ORGANS_ARE_NOT_DEFAULT_USER_SURFACE",
    "DIMA_AUTHORITY_PRECEDES_ROUTE_COLLAPSE",
    "HOST_CAPABILITY_IS_EVIDENCE_NOT_IDENTITY",
    "TOOL_SUCCESS_IS_NOT_TASK_SUCCESS",
    "RECEIPT_AND_READBACK_BEFORE_PROVEN",
  ]),
});

function text(value) {
  return String(value ?? "").trim();
}

export function compileMcpIngress({
  signal,
  objective,
  dimaEvidence = [],
  hostCapabilities = [],
  constraints = [],
} = {}) {
  const normalizedSignal = text(signal);
  const normalizedObjective = text(objective || signal);
  if (!normalizedSignal) throw new TypeError("MCP ingress requires signal");
  if (!normalizedObjective) throw new TypeError("MCP ingress requires objective");

  return Object.freeze({
    receptor: "MCP",
    root: MCP_RECEPTOR_CONTRACT_V1.root,
    task: normalizedObjective,
    signal: normalizedSignal,
    dimaEvidence: Object.freeze([...dimaEvidence]),
    hostCapabilities: Object.freeze([...hostCapabilities]),
    constraints: Object.freeze([...constraints]),
  });
}

export function compileMcpEgress(workResult, { includeDiagnostics = false } = {}) {
  if (!workResult || typeof workResult !== "object") {
    throw new TypeError("MCP egress requires a MondayID Work result");
  }

  const verified = workResult.status === "verified" && workResult.verification?.accepted === true;
  const held = workResult.status === "authority_hold";
  const status = verified ? "PROVEN" : held ? "HOLD" : "OPEN";
  const proof = Object.freeze({
    receiptPresent: Boolean(workResult.receipt),
    verificationAccepted: Boolean(workResult.verification?.accepted),
    promotable: verified && Boolean(workResult.receipt),
  });

  const envelope = {
    contract: "MCP_RECEPTOR_CONTRACT_V1",
    root: MCP_RECEPTOR_CONTRACT_V1.root,
    phenotype: workResult.phenotype ?? null,
    status,
    proof,
    continuation: workResult.verification?.continuation ?? null,
  };

  if (includeDiagnostics) {
    envelope.diagnostics = Object.freeze({
      origin: workResult.origin ?? null,
      authority: workResult.authority ?? null,
      plan: workResult.plan ?? null,
      trace: workResult.trace ?? [],
    });
  }

  return Object.freeze(envelope);
}
