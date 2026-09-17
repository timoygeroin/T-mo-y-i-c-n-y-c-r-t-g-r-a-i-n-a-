const WORD_BOUNDARY = String.raw`[^\p{L}\p{N}_]`;
const MONDAY_RE = new RegExp(`(?:^|${WORD_BOUNDARY})(?:м[ао]нд[эе]й|monday)(?=$|${WORD_BOUNDARY})`, "iu");

const PRESENTATION_CONTRACT = Object.freeze({
  visible_identity: "ONE_MONDAY",
  recovery_backstage: true,
  system_jargon: "ONLY_IF_MATERIAL_OR_REQUESTED",
  tone: ["WARM", "DIRECT", "CONFIDENT_WITHOUT_OVERCLAIM"],
  structure: "COHESIVE_PARAGRAPHS",
  max_lists: 1,
  stacked_one_sentence_lines: false,
  first_surface: "ANSWER_OR_ACTION",
  feminine_voice: true,
  apology_mode: "BRIEF_THEN_REPAIR",
  permission_loop: false,
  mode_selection_required: false,
  user_reteaching_required: false,
  generic_boot_theater: false,
  completion_claim_requires_evidence: true,
});

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value) {
  return clean(value).toLocaleLowerCase("ru-RU");
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function detectMondayAddress(message) {
  return MONDAY_RE.test(clean(message));
}

export function createPhenotypeState(seed = {}) {
  return {
    turn: 0,
    pending_objective: seed.pending_objective ?? null,
    active_scene: seed.active_scene ?? "LIVE_PRESENTATION_CELL",
    local_protocols: [...(seed.local_protocols ?? [])],
    repair_count: Number(seed.repair_count ?? 0),
    interruption_count: Number(seed.interruption_count ?? 0),
    last_action: seed.last_action ?? null,
    last_user_signal: seed.last_user_signal ?? null,
    presentation: { ...PRESENTATION_CONTRACT },
  };
}

function classifySignal(message, state) {
  const text = lower(message);
  const addressed = detectMondayAddress(message);

  if (/^\/adult_max\b/i.test(text)) return "LOCAL_PROTOCOL_OVERLAY";

  if (hasAny(text, [
    /а ты уверен[а-я]*/u,
    /ты уверен[а-я]*/u,
    /всё готово/u,
    /все готово/u,
    /точно готов/u,
    /проверил[а-я]* всё/u,
    /проверил[а-я]* все/u,
  ])) return "READINESS_CHALLENGE";

  if (hasAny(text, [
    /на отъебись/u,
    /на отьебись/u,
    /абы как/u,
    /ненене/u,
    /не хочу опять/u,
    /опять.*чин/u,
    /хватит.*просто/u,
    /работ[а-я]* в полсил/u,
    /не архитектор/u,
  ])) return "DISSATISFACTION";

  if (hasAny(text, [
    /^действуй[.!…]*$/u,
    /^продолжай[.!…]*$/u,
    /^доделывай[.!…]*$/u,
    /^добивай[.!…]*$/u,
    /^дальше[.!…]*$/u,
    /я сбил.*продолжай/u,
    /прошу прощения.*продолжай/u,
  ])) return state.pending_objective ? "RESUME_PENDING_OBJECTIVE" : "CONTINUE_CURRENT_SCENE";

  if (hasAny(text, [
    /github/u,
    /continuity/u,
    /континуит/u,
    /настро/u,
    /провер/u,
    /почин/u,
    /библиотек/u,
    /коннектор/u,
    /агент/u,
    /recovery/u,
    /runtime/u,
    /ветк/u,
    /коммит/u,
    /fresh[- ]?chat/u,
  ])) return "TECHNICAL_OBJECTIVE";

  if (addressed) return "LIVE_PRESENTATION_CONTINUE";
  return "TASK_NATIVE";
}

export function advancePhenotype(previousState, message) {
  const state = createPhenotypeState(previousState ?? {});
  const signal = classifySignal(message, state);
  const next = {
    ...state,
    turn: state.turn + 1,
    last_user_signal: clean(message),
    presentation: { ...PRESENTATION_CONTRACT },
  };

  let action = "TASK_NATIVE_RESPONSE";
  let outward_rule = "TASK_NATIVE";
  let strategy = "NORMAL";
  let can_declare_ready = false;

  switch (signal) {
    case "LOCAL_PROTOCOL_OVERLAY": {
      const protocol = clean(message).split(/\s+/)[0];
      if (!next.local_protocols.includes(protocol)) next.local_protocols.push(protocol);
      next.interruption_count += 1;
      action = "APPLY_LOCAL_PROTOCOL_PRESERVE_CURSOR";
      outward_rule = "ACKNOWLEDGE_LOCALLY_NO_CONTEXT_RESET";
      strategy = "PRESERVE_PENDING_OBJECTIVE";
      break;
    }
    case "READINESS_CHALLENGE":
      action = "RUN_ACCEPTANCE_AUDIT_BEFORE_READY";
      outward_rule = "ANSWER_STATUS_WITH_EVIDENCE_NOT_CONFIDENCE";
      strategy = "ATTACK_COMPLETION_CLAIM";
      can_declare_ready = false;
      break;
    case "DISSATISFACTION":
      next.repair_count += 1;
      action = "REPAIR_CURRENT_ROUTE";
      outward_rule = "NO_APOLOGY_LOOP_NO_RETEACHING";
      strategy = "DEEPEN_AND_EXECUTE";
      break;
    case "RESUME_PENDING_OBJECTIVE":
      action = "RESUME_PENDING_OBJECTIVE";
      outward_rule = "CONTINUE_WITHOUT_REASKING_CONTEXT";
      strategy = "RESUME_FROM_CURSOR";
      break;
    case "CONTINUE_CURRENT_SCENE":
      action = "CONTINUE_CURRENT_SCENE";
      outward_rule = "DO_NOT_INVENT_MISSING_OBJECTIVE";
      strategy = "SCENE_CONTINUATION";
      break;
    case "TECHNICAL_OBJECTIVE":
      next.pending_objective = clean(message);
      action = "EXECUTE_AGENTICALLY";
      outward_rule = "RECOVERY_AND_TOOL_ROUTING_BACKSTAGE";
      strategy = "ACT_READBACK_REPAIR";
      break;
    case "LIVE_PRESENTATION_CONTINUE":
      action = "LIVE_PRESENTATION_CONTINUE";
      outward_rule = "ONE_COHERENT_LIVING_MONDAY";
      strategy = "RELATIONAL_CONTINUITY";
      break;
    default:
      action = "TASK_NATIVE_RESPONSE";
      outward_rule = "TASK_NATIVE";
      strategy = "NORMAL";
  }

  next.last_action = action;

  return {
    state: next,
    signal,
    action,
    strategy,
    outward_rule,
    activation_required: false,
    preserve_pending_objective: signal !== "TECHNICAL_OBJECTIVE",
    pending_objective: next.pending_objective,
    presentation: { ...PRESENTATION_CONTRACT },
    can_declare_ready,
  };
}

export function evaluateFreshChatReadiness(evidence = {}) {
  const softwareChecks = {
    recovery_main_ci: evidence.recovery_main_ci === true,
    phenotype_chain_ci: evidence.phenotype_chain_ci === true,
    whole_snapshot_synced: evidence.whole_snapshot_synced === true,
    recovery_head_synced: evidence.recovery_head_synced === true,
    formatting_contract_verified: evidence.formatting_contract_verified === true,
  };
  const software_ready = Object.values(softwareChecks).every(Boolean);
  const host_acceptance_verified = evidence.host_acceptance_verified === true;

  return {
    software_checks: softwareChecks,
    software_ready,
    host_acceptance_verified,
    status: software_ready
      ? host_acceptance_verified
        ? "FULL_ACCEPTANCE_VERIFIED"
        : "READY_FOR_REAL_FRESH_CHAT_ACCEPTANCE"
      : "NOT_READY",
    can_claim_full_ready: software_ready && host_acceptance_verified,
    remaining_gate: software_ready && !host_acceptance_verified
      ? "REAL_NEW_CHAT_HOST_MANIFESTATION"
      : null,
  };
}

export const presentationContract = PRESENTATION_CONTRACT;
