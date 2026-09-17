const STATUS_RANK = Object.freeze({
  UNKNOWN: 0,
  PROPOSED: 1,
  ENCODED: 2,
  READ_BACK: 3,
  VERIFIED_BRANCH_LOCAL: 4,
  VERIFIED_READY: 5,
  LEARNED: 6,
});

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function statusRank(status) {
  return STATUS_RANK[status] ?? STATUS_RANK.UNKNOWN;
}

function newestVerifiedCanonical(states) {
  const canonical = states.filter(
    (state) => state.canonical === true && statusRank(state.status) >= STATUS_RANK.VERIFIED_READY,
  );
  canonical.sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  return canonical[0] ?? null;
}

export function detectLivePresentationCell(message) {
  const text = clean(message).toLocaleLowerCase("ru-RU");
  if (!text) return false;
  return /(?:^|\s)(?:м[ао]нд[эе]й|monday)(?=$|\s|[!?.,:;🖤❤️😏])/iu.test(text);
}

export function compileFreshChatRecovery(input) {
  const currentSignal = clean(input.current_signal);
  const sourceStates = Array.isArray(input.source_states) ? input.source_states : [];
  const descendants = Array.isArray(input.descendants) ? input.descendants : [];
  const sharedFieldReachable = input.shared_field_reachable !== false;
  const base = newestVerifiedCanonical(sourceStates);

  const acceptedDescendants = descendants
    .filter((item) => item.status === "LEARNED" && item.recovery_safe === true)
    .sort((a, b) => String(a.observed_at ?? "").localeCompare(String(b.observed_at ?? "")));

  const encodedRuntime = descendants
    .filter((item) => item.status === "ENCODED" && item.on_main === true)
    .sort((a, b) => String(a.observed_at ?? "").localeCompare(String(b.observed_at ?? "")));

  const quarantined = descendants.filter(
    (item) => item.status === "VERIFIED_BRANCH_LOCAL" || item.status === "PROPOSED" || item.status === "UNKNOWN",
  );

  const stalePointers = sourceStates.filter((state) => {
    if (state.canonical === true) return false;
    if (!base) return true;
    const referenced = clean(state.references_state_id);
    return Boolean(referenced && referenced !== base.state_id);
  });

  const livePresentation = detectLivePresentationCell(currentSignal);
  const activationRequired = false;

  if (!base) {
    return {
      ok: false,
      action: sharedFieldReachable ? "BLOCK_NO_VERIFIED_CANONICAL_HEAD" : "FALLBACK_WITH_UNKNOWN_FRESHNESS",
      activation_required: activationRequired,
      live_presentation_cell: livePresentation,
      freshness: "UNKNOWN",
      canonical_state_id: null,
      accepted_descendants: [],
      encoded_runtime: encodedRuntime.map((item) => item.id),
      quarantined: uniq(quarantined.map((item) => item.id)),
      stale_pointers: uniq(stalePointers.map((item) => item.id)),
      outward_rule: livePresentation ? "KEEP_RECOVERY_BACKSTAGE" : "TASK_NATIVE",
      blockers: ["no verified canonical organism head available"],
    };
  }

  return {
    ok: true,
    action: "REHYDRATE_AND_CONTINUE",
    activation_required: activationRequired,
    live_presentation_cell: livePresentation,
    freshness: sharedFieldReachable ? "VERIFIED_AT_RECOVERY" : "UNKNOWN",
    canonical_state_id: base.state_id,
    canonical_status: base.status,
    canonical_source: base.source,
    accepted_descendants: acceptedDescendants.map((item) => item.id),
    encoded_runtime: encodedRuntime.map((item) => item.id),
    quarantined: uniq(quarantined.map((item) => item.id)),
    stale_pointers: uniq(stalePointers.map((item) => item.id)),
    outward_rule: livePresentation ? "KEEP_RECOVERY_BACKSTAGE" : "TASK_NATIVE",
    user_must_supply: [],
    invariants: [
      "CELL_IS_NOT_ORGANISM",
      "NO_ACTIVATION_RITUAL",
      "CURRENT_SIGNAL_FIRST",
      "STALE_POINTER_CANNOT_OUTRANK_VERIFIED_CANONICAL_HEAD",
      "LEARNED_DESCENDANT_MAY_COMPOSE_WITHOUT_RETEACHING",
      "ENCODED_IS_NOT_LEARNED",
      "BRANCH_LOCAL_VERIFICATION_IS_NOT_CANON",
      "UNKNOWN_REMAINS_UNKNOWN",
      "LIVE_PRESENTATION_RECOVERY_STAYS_BACKSTAGE",
    ],
    blockers: [],
  };
}
