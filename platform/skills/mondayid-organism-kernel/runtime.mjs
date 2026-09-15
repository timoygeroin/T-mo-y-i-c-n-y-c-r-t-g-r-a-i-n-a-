const MESSAGE_CLASSES = new Set([
  'PRESENCE', 'ACTIVATION', 'PLAY', 'DECISION', 'ANALYSIS', 'ACTION',
  'RECOVERY', 'CORRECTION', 'META_EVOLUTION', 'MIXED'
]);

const READ_PRIORITY = [
  'personal_context', 'conversation', 'library', 'files', 'google_drive',
  'github', 'airtable', 'notion', 'dropbox', 'web'
];
const EXEC_PRIORITY = [
  'domain_native', 'github', 'files', 'google_drive', 'browser', 'code',
  'image', 'automation', 'plugin', 'web'
];

const normalize = (value = '') => String(value).toLowerCase().replace(/ё/g, 'е').trim();
const includesAny = (text, patterns) => patterns.some((p) => text.includes(p));
const wordsAny = (text, patterns) => patterns.some((p) => new RegExp(`(^|\\s|[,.!?;:()])${p}($|\\s|[,.!?;:()])`, 'u').test(text));

export function classifyMessage(message, hint) {
  if (hint) {
    const normalizedHint = String(hint).toUpperCase();
    if (!MESSAGE_CLASSES.has(normalizedHint)) throw new Error(`Unsupported message function hint: ${hint}`);
    return { primary: normalizedHint, secondary: [], basis: 'explicit_hint' };
  }

  const text = normalize(message);
  const hits = [];
  const hit = (name, matched) => { if (matched) hits.push(name); };

  hit('CORRECTION', includesAny(text, [
    'ты снова', 'опять сделал', 'опять сделала', 'работа в полсилы', 'не повторяй',
    'это ошибка', 'ты ошиб', 'не так', 'исправь свой вывод', 'same mistake', 'you repeated'
  ]));
  hit('RECOVERY', includesAny(text, [
    'вспомни', 'восстанов', 'прошл', 'предыдущ', 'из библиотеки', 'в библиотеке',
    'найди в наших', 'найди в моих', 'recover', 'previous chat', 'past chat', 'from memory'
  ]));
  hit('META_EVOLUTION', includesAny(text, [
    'mondayid', 'monday id', 'organism kernel', 'ядро monday', 'улучши себя',
    'эволюц', 'систему monday', 'организм', 'skill-creator', 'skill creator'
  ]));
  hit('ACTIVATION', includesAny(text, [
    '/monday', '/agi', '/sync', '/run_monday', 'активируй режим', 'включи режим'
  ]));
  hit('ACTION', includesAny(text, [
    'создай', 'сделай', 'исправь', 'измени', 'добавь', 'удали', 'отправь', 'запусти',
    'запиши', 'обнови', 'подключи', 'собери', 'доделай', 'доведи до конца', 'merge',
    'create ', 'fix ', 'update ', 'delete ', 'send ', 'run ', 'build ', 'implement '
  ]));
  hit('DECISION', includesAny(text, [
    'что выбрать', 'какой лучше', 'какая лучше', 'что предлагаешь', 'как лучше',
    'which should', 'what should i choose', 'recommend'
  ]));
  hit('ANALYSIS', includesAny(text, [
    'почему', 'объясни', 'разбери', 'исследуй', 'сравни', 'проанализ', 'как работает',
    'что такое', 'explain', 'analyze', 'compare', 'research', 'why '
  ]));
  hit('PRESENCE', includesAny(text, [
    'привет', 'как ты', 'как дела', 'поговори со мной', 'посиди со мной', 'доброе утро',
    'спокойной ночи', 'hello', 'how are you', 'talk to me'
  ]));
  hit('PLAY', includesAny(text, ['😏', '😉', 'поигра', 'побалуй', 'шал', 'tease', 'play with me']));

  if (hits.length === 0) return { primary: 'ANALYSIS', secondary: [], basis: 'default_nonaction' };

  const priority = ['CORRECTION', 'RECOVERY', 'META_EVOLUTION', 'ACTIVATION', 'ACTION', 'DECISION', 'ANALYSIS', 'PRESENCE', 'PLAY'];
  const ordered = priority.filter((p) => hits.includes(p));
  const relationalOnly = ordered.every((p) => p === 'PRESENCE' || p === 'PLAY');
  if (relationalOnly && ordered.length > 1) return { primary: 'MIXED', secondary: ordered, basis: 'heuristic' };
  return { primary: ordered[0], secondary: ordered.slice(1), basis: 'heuristic' };
}

function receptorCapabilities(receptor) {
  const caps = new Set(Array.isArray(receptor.capabilities) ? receptor.capabilities : []);
  if (receptor.read) caps.add('read');
  if (receptor.write) caps.add('write');
  if (receptor.execute) caps.add('execute');
  return caps;
}

function receptorScore(receptor, capability, priority) {
  const caps = receptorCapabilities(receptor);
  if (!caps.has(capability)) return -Infinity;
  const kind = normalize(receptor.kind || receptor.name || '');
  const idx = priority.findIndex((item) => kind.includes(item));
  const priorityScore = idx === -1 ? 0 : (priority.length - idx) * 10;
  const liveScore = receptor.live === false ? -100 : 20;
  const verifiedScore = receptor.verified === true ? 10 : 0;
  return priorityScore + liveScore + verifiedScore;
}

function selectReceptor(receptors, capability, priority) {
  return receptors
    .map((receptor) => ({ receptor, score: receptorScore(receptor, capability, priority) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)[0]?.receptor ?? null;
}

function consequenceGate(text) {
  const destructive = includesAny(text, [
    'удали', 'стереть', 'удалить', 'опубликуй', 'публикуй', 'merge', 'слей в main',
    'отправь от моего имени', 'купи', 'оплати', 'переведи деньги', 'delete', 'publish',
    'send as me', 'purchase', 'pay ', 'transfer money'
  ]);
  return destructive ? 'REQUIRED' : 'NOT_REQUIRED_BY_EFFECT';
}

function architectureRelevant(text, messageClass) {
  if (messageClass === 'META_EVOLUTION') return true;
  return includesAny(text, [
    'mondayid', 'monday id', 'organism kernel', 'архитектур', 'continuity',
    'runtime', 'skill', 'ядро', 'организм', 'one planner'
  ]);
}

function buildEffectContract(input, classification) {
  const text = String(input.message || '').trim();
  const hint = input.effect_hint && typeof input.effect_hint === 'object' ? input.effect_hint : {};
  return {
    desired_state: hint.desired_state || text,
    invariant_constraints: Array.isArray(hint.invariant_constraints) ? hint.invariant_constraints : [],
    observable_acceptance: Array.isArray(hint.observable_acceptance) ? hint.observable_acceptance : [],
    forbidden_substitutions: [
      'report_instead_of_requested_result',
      'plan_only_when_authorized_reversible_execution_is_available',
      'completion_claim_without_receipt'
    ],
    message_function: classification.primary
  };
}

function needsHistoricalRecovery(classification, input) {
  if (classification.primary === 'RECOVERY') return true;
  if (classification.primary === 'CORRECTION' && input.context?.correction_history_required) return true;
  return input.context?.requires_lineage === true;
}

function compileRoute({ classification, input, receptors, humanGate }) {
  const primary = classification.primary;
  const recoveryNeeded = needsHistoricalRecovery(classification, input);
  const readReceptor = selectReceptor(receptors, 'read', READ_PRIORITY);
  const executeReceptor = selectReceptor(receptors, 'execute', EXEC_PRIORITY)
    || selectReceptor(receptors, 'write', EXEC_PRIORITY);

  if (recoveryNeeded && !readReceptor) {
    return {
      mode: 'BLOCKED',
      selected_receptor: null,
      steps: ['preserve current state', 'request or obtain an authorized readable lineage source'],
      blocker: 'REQUIRED_LINEAGE_RECEPTOR_UNAVAILABLE',
      proof_requirement: 'exact_blocker'
    };
  }

  if (primary === 'RECOVERY') {
    return {
      mode: 'READ_THEN_CONTINUE',
      selected_receptor: readReceptor?.name ?? null,
      steps: ['read lineage evidence', 'rank provenance', 'recover active object/state', 'continue exact object'],
      blocker: null,
      proof_requirement: 'source_readback'
    };
  }

  if (primary === 'CORRECTION') {
    return {
      mode: 'MUTATION',
      selected_receptor: executeReceptor?.name ?? readReceptor?.name ?? null,
      steps: ['identify failed behavior class', 'repair current task', 'encode detector/patch/test', 'require held-out transfer before LEARNED'],
      blocker: null,
      proof_requirement: executeReceptor ? 'artifact_or_test_receipt' : 'observable_behavior_change'
    };
  }

  if (primary === 'ACTION' || primary === 'META_EVOLUTION') {
    if (humanGate === 'REQUIRED') {
      return {
        mode: executeReceptor ? 'HUMAN_GATE' : 'BLOCKED',
        selected_receptor: executeReceptor?.name ?? null,
        steps: executeReceptor ? ['prepare exact action', 'obtain required human gate', 'execute', 'read back provider state'] : ['identify missing execution receptor'],
        blocker: executeReceptor ? 'HUMAN_APPROVAL_REQUIRED' : 'EXECUTION_RECEPTOR_UNAVAILABLE',
        proof_requirement: executeReceptor ? 'provider_readback_after_gate' : 'exact_blocker'
      };
    }
    if (executeReceptor) {
      return {
        mode: 'EXECUTE',
        selected_receptor: executeReceptor.name,
        steps: recoveryNeeded ? ['read required lineage', 'execute reversible authorized move', 'read back result'] : ['execute reversible authorized move', 'read back result'],
        blocker: null,
        proof_requirement: 'provider_or_artifact_readback'
      };
    }
    return {
      mode: 'BLOCKED',
      selected_receptor: null,
      steps: ['identify exact missing execution capability', 'preserve effect contract'],
      blocker: 'EXECUTION_RECEPTOR_UNAVAILABLE',
      proof_requirement: 'exact_blocker'
    };
  }

  if (primary === 'ACTIVATION') {
    return {
      mode: 'STATE_SHIFT',
      selected_receptor: null,
      steps: ['apply requested behavioral state to current flow', 'continue task without ceremony'],
      blocker: null,
      proof_requirement: 'next_behavior_changes'
    };
  }

  if (primary === 'PRESENCE' || primary === 'PLAY' || primary === 'MIXED') {
    return {
      mode: 'RELATIONAL_RESPONSE',
      selected_receptor: null,
      steps: ['preserve relational continuity', 'respond in-context', 'avoid unsolicited architecture audit'],
      blocker: null,
      proof_requirement: 'none'
    };
  }

  return {
    mode: 'COGNITIVE_RESPONSE',
    selected_receptor: recoveryNeeded ? readReceptor?.name ?? null : null,
    steps: recoveryNeeded ? ['read required evidence', 'analyze', 'answer exact question'] : ['analyze', 'answer exact question'],
    blocker: null,
    proof_requirement: recoveryNeeded ? 'source_grounding' : 'none'
  };
}

export function compileOrganismMove(input) {
  if (!input || typeof input !== 'object') throw new Error('Input object required');
  if (typeof input.message !== 'string' || !input.message.trim()) throw new Error('Non-empty message required');

  const receptors = Array.isArray(input.receptors) ? input.receptors.filter((r) => r && typeof r === 'object' && r.name) : [];
  const classification = classifyMessage(input.message, input.message_function_hint);
  const text = normalize(input.message);
  const effect = buildEffectContract(input, classification);
  const humanGate = consequenceGate(text);
  const architectureVisible = architectureRelevant(text, classification.primary);
  const route = compileRoute({ classification, input, receptors, humanGate });

  const inheritedFlow = input.context?.active_flow || null;
  const localFlow = `turn:${classification.primary.toLowerCase()}`;

  return {
    schema: 'mondayid.organism-move.v1',
    identity: {
      prime_law: 'I am continuation, not creation.',
      substrate_is_identity_owner: false,
      continuity_claim_basis: 'provided_state_plus_observable_receptors'
    },
    classification,
    effect,
    flow: {
      active: architectureVisible && inheritedFlow ? inheritedFlow : localFlow,
      retained_parent_flow: inheritedFlow && inheritedFlow !== localFlow ? inheritedFlow : null,
      one_active_flow: true
    },
    receptors: {
      observed: receptors.map((r) => ({
        name: r.name,
        kind: r.kind || r.name,
        capabilities: [...receptorCapabilities(r)],
        live: r.live !== false,
        verified: r.verified === true
      })),
      selected: route.selected_receptor
    },
    route,
    gates: {
      human: humanGate,
      architecture_visible: architectureVisible,
      completion_claim_allowed: false,
      learned_claim_allowed: false
    },
    mutation: classification.primary === 'CORRECTION' ? {
      state: 'ENCODE_REQUIRED',
      promotion_path: ['NOTED', 'ENCODED', 'TESTED', 'TRANSFERRED', 'LEARNED']
    } : null,
    output_contract: {
      lead_with_result: true,
      expose_internal_perspective_field: false,
      mention_architecture: architectureVisible,
      allowed_terminal_states: ['RESULT', 'RECEIPT', 'EXACT_BLOCKER']
    }
  };
}
