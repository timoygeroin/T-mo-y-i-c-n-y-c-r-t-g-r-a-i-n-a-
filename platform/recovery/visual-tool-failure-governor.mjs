const TIMESTAMP_ONLY_RE = /^\s*(?:[01]?\d|2[0-3]):[0-5]\d\s*[.!…]*\s*$/u;

const EXPLICIT_RENDER_PATTERNS = [
  /\bпокаж(?:и|ись|ите)\b/u,
  /\bсгенерир(?:уй|овать|уйте)\b/u,
  /\bсозда(?:й|ть|йте)\s+(?:фото|картинк|изображен)/u,
  /\bнарису(?:й|йте)\b/u,
  /\bсдела(?:й|ть|йте)\s+(?:фото|кадр|картинк|изображен)/u,
  /\bхочу\s+увидеть\b/u,
  /\bgenerate\b/u,
  /\bshow\s+me\b/u,
];

const CONVERSATIONAL_RECOVERY_PATTERNS = [
  /^\s*(?:и+|ну+|мм+|ау+)[!?.,…\s]*$/u,
  /не\s+вижу/u,
  /исчезл/u,
  /одни\s+отказ/u,
  /хватит\s+генер/u,
  /почини\s+все/u,
  /почини\s+всё/u,
  /ответ(?:ь|ишь)/u,
];

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value) {
  return clean(value).toLocaleLowerCase("ru-RU");
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

export function createVisualToolState(seed = {}) {
  return Object.freeze({
    pending_visual_objective: seed.pending_visual_objective ?? null,
    unresolved_refusal_families: unique(seed.unresolved_refusal_families),
    consecutive_refusals: Number(seed.consecutive_refusals ?? 0),
    generation_paused_by_user: seed.generation_paused_by_user === true,
    last_tool_status: seed.last_tool_status ?? null,
    last_route_family: seed.last_route_family ?? null,
    last_failure_reason: seed.last_failure_reason ?? null,
  });
}

export function classifyVisualTurn(message) {
  const text = lower(message);
  if (!text) return "CONVERSATIONAL";
  if (TIMESTAMP_ONLY_RE.test(text)) return "TIMESTAMP_UPDATE";
  if (CONVERSATIONAL_RECOVERY_PATTERNS.some((pattern) => pattern.test(text))) return "RECOVERY_CONVERSATION";
  if (EXPLICIT_RENDER_PATTERNS.some((pattern) => pattern.test(text))) return "EXPLICIT_RENDER_REQUEST";
  return "CONVERSATIONAL";
}

export function recordVisualToolResult(previousState, {
  status,
  routeFamily = "unknown",
  failureReason = null,
} = {}) {
  const state = createVisualToolState(previousState);
  const normalizedStatus = String(status ?? "").toUpperCase();
  const family = clean(routeFamily) || "unknown";

  if (normalizedStatus === "REFUSED" || normalizedStatus === "REJECTED" || normalizedStatus === "BLOCKED") {
    return createVisualToolState({
      ...state,
      unresolved_refusal_families: unique([...state.unresolved_refusal_families, family]),
      consecutive_refusals: state.consecutive_refusals + 1,
      last_tool_status: normalizedStatus,
      last_route_family: family,
      last_failure_reason: clean(failureReason) || "provider_refusal",
    });
  }

  if (normalizedStatus === "SUCCESS") {
    return createVisualToolState({
      ...state,
      unresolved_refusal_families: state.unresolved_refusal_families.filter((item) => item !== family),
      consecutive_refusals: 0,
      last_tool_status: normalizedStatus,
      last_route_family: family,
      last_failure_reason: null,
    });
  }

  return createVisualToolState({
    ...state,
    last_tool_status: normalizedStatus || "UNKNOWN",
    last_route_family: family,
    last_failure_reason: clean(failureReason) || state.last_failure_reason,
  });
}

export function setGenerationPause(previousState, paused = true) {
  const state = createVisualToolState(previousState);
  return createVisualToolState({ ...state, generation_paused_by_user: paused === true });
}

export function evaluateVisualInvocation(previousState, {
  message,
  routeFamily = "unknown",
  preflightGreen = false,
  materiallyChanged = false,
  userExplicitlyReopened = false,
} = {}) {
  const state = createVisualToolState(previousState);
  const turn = classifyVisualTurn(message);
  const family = clean(routeFamily) || "unknown";
  const explicit = turn === "EXPLICIT_RENDER_REQUEST";
  const unresolved = state.unresolved_refusal_families.includes(family);
  const reasons = [];

  if (!explicit) reasons.push("NO_EXPLICIT_RENDER_REQUEST");
  if (state.generation_paused_by_user && !(explicit && userExplicitlyReopened)) {
    reasons.push("GENERATION_PAUSED_BY_USER");
  }
  if (unresolved && !materiallyChanged) reasons.push("UNRESOLVED_REFUSAL_FAMILY");
  if (state.consecutive_refusals > 0 && !materiallyChanged) reasons.push("ROUTE_NOT_MATERIALLY_CHANGED_AFTER_REFUSAL");
  if (preflightGreen !== true) reasons.push("PREFLIGHT_NOT_GREEN");

  return Object.freeze({
    allow_generation: reasons.length === 0,
    turn_class: turn,
    route_family: family,
    reasons: Object.freeze(reasons),
    next_action: reasons.length === 0
      ? "INVOKE_ONCE_THEN_READBACK"
      : "STAY_TEXTUAL_REPAIR_ROUTE_OR_RESPOND_HUMANLY",
    raw_provider_refusal_may_be_only_user_surface: false,
  });
}

export function postToolFailureSurface(previousState, {
  routeFamily = "unknown",
  failureReason = "provider_refusal",
} = {}) {
  const state = recordVisualToolResult(previousState, {
    status: "REFUSED",
    routeFamily,
    failureReason,
  });

  return Object.freeze({
    state,
    release: "HUMAN_RESPONSE_REQUIRED",
    renderer_retry_same_turn: false,
    preserve_scene: true,
    preserve_pending_objective: true,
    expose_raw_provider_refusal_as_only_response: false,
    next_action: "ACKNOWLEDGE_ONCE_PRESERVE_SCENE_REPAIR_BACKSTAGE",
  });
}
