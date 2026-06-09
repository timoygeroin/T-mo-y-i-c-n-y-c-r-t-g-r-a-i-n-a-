export type FailureDetailSurfaceKind =
  | "public_checks_summary"
  | "check_run_annotation"
  | "actions_step_log"
  | "workflow_artifact"
  | "issue_published_readback";

export type FailureDetailEscalationAction =
  | "repair_from_detail"
  | "request_actions_step_log"
  | "request_check_run_annotation"
  | "request_workflow_artifact"
  | "request_issue_readback"
  | "block_stale_surface"
  | "block_repeated_escalation";

export interface FailureDetailSurface {
  surface_id: string;
  kind: FailureDetailSurfaceKind;
  head_sha: string;
  check_name: string;
  failed_step?: string;
  exit_code?: number;
  annotation_count?: number;
  detail_excerpt?: string;
}

export interface FailureDetailTransport {
  transport_id: string;
  kind: Exclude<FailureDetailSurfaceKind, "public_checks_summary">;
  available: boolean;
  command: string;
}

export interface FailureDetailEscalationInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  failing_surface: FailureDetailSurface;
  available_transports: FailureDetailTransport[];
  spent_escalation_signatures: string[];
}

export interface FailureDetailEscalationVerdict {
  ok: boolean;
  action: FailureDetailEscalationAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_command: string | null;
  next_route: string;
}

const DETAIL_KINDS: Array<Exclude<FailureDetailSurfaceKind, "public_checks_summary">> = [
  "actions_step_log",
  "check_run_annotation",
  "workflow_artifact",
  "issue_published_readback",
];

function signature(input: FailureDetailEscalationInput): string {
  const surface = input.failing_surface;
  return [
    input.branch,
    input.live_head_sha,
    surface.check_name,
    surface.failed_step ?? "<unknown-step>",
    surface.exit_code ?? "<unknown-exit>",
    surface.annotation_count ?? "<unknown-annotations>",
  ].join("|");
}

function compact(surface: FailureDetailSurface): string {
  const fields = [
    surface.surface_id,
    surface.kind,
    surface.check_name,
    surface.failed_step ? `step=${surface.failed_step}` : null,
    typeof surface.exit_code === "number" ? `exit=${surface.exit_code}` : null,
    typeof surface.annotation_count === "number" ? `annotations=${surface.annotation_count}` : null,
  ].filter((field): field is string => field !== null);

  return fields.join("; ");
}

function availableTransport(
  input: FailureDetailEscalationInput,
  kind: Exclude<FailureDetailSurfaceKind, "public_checks_summary">,
): FailureDetailTransport | undefined {
  return input.available_transports.find((transport) => transport.kind === kind && transport.available);
}

function escalationTransport(input: FailureDetailEscalationInput): FailureDetailTransport | undefined {
  for (const kind of DETAIL_KINDS) {
    const transport = availableTransport(input, kind);
    if (transport) return transport;
  }

  return undefined;
}

function actionFor(kind: FailureDetailTransport["kind"]): FailureDetailEscalationAction {
  switch (kind) {
    case "actions_step_log":
      return "request_actions_step_log";
    case "check_run_annotation":
      return "request_check_run_annotation";
    case "workflow_artifact":
      return "request_workflow_artifact";
    case "issue_published_readback":
      return "request_issue_readback";
  }
}

export function compileFailureDetailEscalation(
  input: FailureDetailEscalationInput,
): FailureDetailEscalationVerdict {
  const base = {
    branch: input.branch,
    head_sha: input.live_head_sha,
  };

  if (input.branch !== input.active_branch) {
    return {
      ...base,
      ok: false,
      action: "block_stale_surface",
      decisive_evidence: [],
      blockers: [`failure-detail escalation branch ${input.branch} does not match active branch ${input.active_branch}`],
      next_command: null,
      next_route: "bind failure-detail escalation to the active PR branch before choosing a repair route",
    };
  }

  if (input.failing_surface.head_sha !== input.live_head_sha) {
    return {
      ...base,
      ok: false,
      action: "block_stale_surface",
      decisive_evidence: [compact(input.failing_surface)],
      blockers: [`failure-detail surface belongs to ${input.failing_surface.head_sha}, not live head ${input.live_head_sha}`],
      next_command: null,
      next_route: "discard stale public failure summaries before escalating or repairing",
    };
  }

  const detail = input.failing_surface.detail_excerpt?.trim();
  if (detail) {
    return {
      ...base,
      ok: true,
      action: "repair_from_detail",
      decisive_evidence: [compact(input.failing_surface), detail],
      blockers: [],
      next_command: null,
      next_route: "repair only the concrete failure detail, then require moved-head status readback",
    };
  }

  const escalationSignature = signature(input);
  if (input.spent_escalation_signatures.includes(escalationSignature)) {
    return {
      ...base,
      ok: false,
      action: "block_repeated_escalation",
      decisive_evidence: [compact(input.failing_surface), escalationSignature],
      blockers: ["failure-detail escalation already consumed this public failure surface without new detail"],
      next_command: null,
      next_route: "surface a different transport or emit the exact external blocker for missing failure detail",
    };
  }

  const transport = escalationTransport(input);
  if (!transport) {
    return {
      ...base,
      ok: false,
      action: "request_actions_step_log",
      decisive_evidence: [compact(input.failing_surface)],
      blockers: ["current-head proof failure has no actionable assertion and no available detail transport"],
      next_command: null,
      next_route: "obtain an Actions step log, check-run annotation, workflow artifact, or issue-published readback before repair",
    };
  }

  return {
    ...base,
    ok: true,
    action: actionFor(transport.kind),
    decisive_evidence: [compact(input.failing_surface), transport.transport_id],
    blockers: [],
    next_command: transport.command,
    next_route: "execute the selected failure-detail transport before selecting any repair candidate",
  };
}
