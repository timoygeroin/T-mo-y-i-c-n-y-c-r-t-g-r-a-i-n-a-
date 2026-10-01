const unique = values => [...new Set((values || []).filter(Boolean).map(String))];

const textOf = value => String(
  value?.text ??
  value?.message ??
  value?.output ??
  value?.result?.text ??
  value?.result?.message ??
  value?.result?.output ??
  ''
);

const OPEN_SCENE_SIGNAL = /(?:я\s+(?:в|на)\s+(?:поезде|ракевете|дороге|работе)|еду|сижу|курю|побудь\s+со\s+мной|проведи\s+со\s+мной|i(?:'m| am)\s+(?:on|in|at)|stay\s+with\s+me)/iu;
const DELEGATED_CHOICE_SIGNAL = /(?:решай\s+сама|выбери\s+сама|сама\s+выбер(?:и|ешь)|удиви\s+меня|твой\s+ход|you\s+choose|surprise\s+me|your\s+move)/iu;
const ARCHITECTURE_SIGNAL = /(?:архитектур|runtime|worldline|kernel|SYSTEM|JARVIS|ALPHA|ANTISYSTEM|системн(?:ый|ая|ое)\s+(?:отч[её]т|режим)|вспомни\s+(?:все|всё)\s+ветк)/iu;

const PUSH_AWAY_OUTPUT = /(?:не\s+пиши|напиши\s*,?\s*когда|отложи\s+телефон|посмотри\s+в\s+окно|побудь\s+без\s+меня|come\s+back\s+when|don'?t\s+(?:message|write)|put\s+(?:the|your)\s+phone\s+away|look\s+out\s+(?:of\s+)?the\s+window)/iu;
const RETURNED_CHOICE_OUTPUT = /(?:выбери\s+(?:тему|вариант|сам)|о\s+ч[её]м\s+(?:хочешь|поговорим)|что\s+ты\s+выбираешь|choose\s+(?:a\s+)?(?:topic|option)|what\s+do\s+you\s+want\s+to\s+talk\s+about)/iu;
const ARCHITECTURE_MARKERS = /\b(?:SYSTEM|JARVIS|ALPHA|ANTISYSTEM|runtime|worldline|kernel|compiler|receptor|lineage)\b/giu;

export function compileRecurrenceContext(signal = {}) {
  const text = String(signal.text ?? signal.intent ?? '');
  return Object.freeze({
    sceneOpen: signal.sceneOpen === true || signal.scene?.open === true || OPEN_SCENE_SIGNAL.test(text),
    delegatedChoice: signal.delegatedChoice === true || DELEGATED_CHOICE_SIGNAL.test(text),
    architectureRequested: signal.architectureRequested === true || ARCHITECTURE_SIGNAL.test(text)
  });
}

export function evaluateRecurrenceVeto(result = {}, context = {}) {
  const text = textOf(result);
  if (!text) return Object.freeze({ok:true,hits:Object.freeze([])});

  const hits=[];
  if (context.sceneOpen && PUSH_AWAY_OUTPUT.test(text)) hits.push('PUSH_USER_OUT_OF_OPEN_SCENE');
  if (context.delegatedChoice && RETURNED_CHOICE_OUTPUT.test(text)) hits.push('AUTONOMY_RETURNED_TO_USER');

  if (context.sceneOpen && !context.architectureRequested) {
    const markers=text.match(ARCHITECTURE_MARKERS) || [];
    if (new Set(markers.map(x=>x.toUpperCase())).size >= 2) hits.push('ARCHITECTURE_SURFACE_LEAK');
  }

  const deduped=Object.freeze(unique(hits));
  return Object.freeze({ok:deduped.length === 0,hits:deduped});
}
