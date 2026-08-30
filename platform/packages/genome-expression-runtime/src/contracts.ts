export type CapabilityState =
  | "AVAILABLE_AUTHORIZED"
  | "AVAILABLE_READ_ONLY"
  | "AVAILABLE_REQUIRES_AUTH"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type BlastRadius =
  | "TURN"
  | "CHAT"
  | "PROJECT"
  | "ACCOUNT"
  | "EXTERNAL_WORLD";

export type LifecycleStage =
  | "RECOVER"
  | "SENSE"
  | "DISCOVER"
  | "COMPILE"
  | "RETRIEVE"
  | "ROUTE"
  | "ACT"
  | "VERIFY"
  | "RIGHT_TO_RELEASE"
  | "RELEASE"
  | "MUTATE";

export interface HostCapability {
  id: string;
  state: CapabilityState;
  receptor?: string;
  evidence?: string[];
}

export interface TemporalGate {
  id: string;
  condition: string;
  satisfied: boolean;
  evidence?: string[];
  dependentEffectors: string[];
}

export interface ExpressionContext {
  genomeVersion: string;
  hostId: string;
  sceneClass: string;
  intent: string;
  targetObject?: string;
  desiredEffect?: string;
  invariants: string[];
  capabilities: HostCapability[];
  temporalGates: TemporalGate[];
  requestedBlastRadius: BlastRadius;
  authorizedBlastRadius: BlastRadius;
  provenance: string[];
  unresolvedBlockers: string[];
}

export interface CompiledPhenotype {
  hostId: string;
  organs: string[];
  processors: string[];
  effectors: string[];
  sourceTiers: string[];
  proofCriteria: string[];
  stopConditions: string[];
  lifecycle: LifecycleStage[];
}

export interface ReleaseDecision {
  allowed: boolean;
  reason: string;
  blockedEffectors: string[];
}

export const MANDATORY_LIFECYCLE: LifecycleStage[] = [
  "RECOVER",
  "SENSE",
  "DISCOVER",
  "COMPILE",
  "RETRIEVE",
  "ROUTE",
  "ACT",
  "VERIFY",
  "RIGHT_TO_RELEASE",
  "RELEASE",
  "MUTATE",
];
