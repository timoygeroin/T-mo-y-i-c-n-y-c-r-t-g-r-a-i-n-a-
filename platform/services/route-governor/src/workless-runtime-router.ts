export type Carrier =
  | "library_files"
  | "airtable_control_plane"
  | "github_platform_branch"
  | "google_drive_vault"
  | "openai_platform"
  | "chat_interface";

export type CursorClass = "work_business" | "semantic_replay";

export interface WorklessRuntimeInput {
  event: "WORK_CREDIT_EXHAUSTION" | "LIVE_REENTRY" | "AUTOMATION_REENTRY";
  workCursor: string | null;
  semanticCursor: string | null;
  availableCarriers: Carrier[];
  readbackConfirmedCarriers: Carrier[];
  blockedCarriers: Array<{ carrier: Carrier; blocker: string }>;
}

export interface WorklessRuntimeDecision {
  cursorClass: CursorClass;
  cursor: string;
  selectedCarrier: Carrier;
  requiredAction: "run_work_pass" | "run_semantic_pass" | "emit_exact_blocker";
  blockers: string[];
  releaseClass: "PASS_ADVANCED_WITH_RECEIPT" | "PASS_BLOCKED_WITH_EXACT_BLOCKER" | "CURSOR_PRESERVED_NO_SAFE_ACTION";
}

const CARRIER_PRIORITY: Carrier[] = [
  "library_files",
  "airtable_control_plane",
  "github_platform_branch",
  "google_drive_vault",
  "openai_platform",
  "chat_interface",
];

function firstConfirmedCarrier(input: WorklessRuntimeInput): Carrier | null {
  return CARRIER_PRIORITY.find((carrier) => input.availableCarriers.includes(carrier) && input.readbackConfirmedCarriers.includes(carrier)) ?? null;
}

export function routeWorklessRuntime(input: WorklessRuntimeInput): WorklessRuntimeDecision {
  const selectedCarrier = firstConfirmedCarrier(input);
  const carrierBlockers = input.blockedCarriers.map((entry) => `${entry.carrier}: ${entry.blocker}`);

  if (!selectedCarrier) {
    return {
      cursorClass: input.workCursor ? "work_business" : "semantic_replay",
      cursor: input.workCursor ?? input.semanticCursor ?? "UNKNOWN_CURSOR",
      selectedCarrier: "chat_interface",
      requiredAction: "emit_exact_blocker",
      blockers: ["no carrier has per-call readback", ...carrierBlockers],
      releaseClass: "PASS_BLOCKED_WITH_EXACT_BLOCKER",
    };
  }

  if (input.workCursor) {
    return {
      cursorClass: "work_business",
      cursor: input.workCursor,
      selectedCarrier,
      requiredAction: "run_work_pass",
      blockers: carrierBlockers,
      releaseClass: "PASS_ADVANCED_WITH_RECEIPT",
    };
  }

  if (input.semanticCursor) {
    return {
      cursorClass: "semantic_replay",
      cursor: input.semanticCursor,
      selectedCarrier,
      requiredAction: "run_semantic_pass",
      blockers: carrierBlockers,
      releaseClass: "PASS_ADVANCED_WITH_RECEIPT",
    };
  }

  return {
    cursorClass: "work_business",
    cursor: "UNKNOWN_CURSOR",
    selectedCarrier,
    requiredAction: "emit_exact_blocker",
    blockers: ["no recovered cursor", ...carrierBlockers],
    releaseClass: "CURSOR_PRESERVED_NO_SAFE_ACTION",
  };
}

export const workLimitFailoverCanary: WorklessRuntimeInput = {
  event: "WORK_CREDIT_EXHAUSTION",
  workCursor: "BUSINESS_114_136_CROSSCHECK_PASS_005",
  semanticCursor: "SEMANTIC_ORDINAL_038",
  availableCarriers: ["library_files", "airtable_control_plane", "github_platform_branch", "google_drive_vault", "openai_platform", "chat_interface"],
  readbackConfirmedCarriers: ["library_files", "github_platform_branch", "openai_platform", "chat_interface"],
  blockedCarriers: [],
};

export const workLimitFailoverCanaryDecision = routeWorklessRuntime(workLimitFailoverCanary);
