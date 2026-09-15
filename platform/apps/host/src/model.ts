export type Phase = "intent" | "context" | "action" | "verification";
export type Turn = {
  id: string; createdAt: string; request: string; intent: string; context: string[];
  decision: string; result?: string; verified: boolean;
};
export type HostState = { version: 1; turns: Turn[]; activeId?: string };

const KEY = "mondayid.host.v1";
export const MAX_PACKET_BYTES = 5 * 1024 * 1024;
const LEGACY_RESULT = "Ход выполнен и ожидает подтверждения результата.";
const empty = (): HostState => ({ version: 1, turns: [] });
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === "string" && v.length <= 100_000;

export function validateState(value: unknown): HostState {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.turns) || value.turns.length > 1000) throw new Error("Некорректное состояние MondayID.");
  const ids = new Set<string>();
  const turns = value.turns.map((t): Turn => {
    if (!object(t) || !string(t.id) || !t.id || ids.has(t.id) || !string(t.createdAt) || !Number.isFinite(Date.parse(t.createdAt)) ||
      !string(t.request) || !string(t.intent) || !string(t.decision) || typeof t.verified !== "boolean" ||
      !Array.isArray(t.context) || t.context.length > 100 || !t.context.every(string) || (t.result !== undefined && !string(t.result))) throw new Error("Некорректная запись или повторяющийся идентификатор.");
    ids.add(t.id);
    // The old UI generated this text without executing anything. Never migrate it as proof.
    const result = t.result === LEGACY_RESULT ? undefined : t.result as string | undefined;
    const context = t.context.filter((s: string) => s !== "Текущий разговор" && s !== "Канон MondayID");
    return { id: t.id, createdAt: t.createdAt, request: t.request, intent: t.intent, decision: t.decision,
      context, ...(result === undefined ? {} : { result }), verified: !!result?.trim() && t.verified };
  });
  if (value.activeId !== undefined && (!string(value.activeId) || !ids.has(value.activeId))) throw new Error("Активная запись отсутствует в истории.");
  return { version: 1, turns, activeId: value.activeId as string | undefined };
}
export function loadStateResult(): { state: HostState; error?: string } {
  try {
    const raw = localStorage.getItem(KEY);
    return { state: raw === null ? empty() : validateState(JSON.parse(raw)) };
  } catch { return { state: empty(), error: "Сохранённое состояние недоступно или повреждено. Автосохранение приостановлено, чтобы не затереть данные." }; }
}
export function loadState(): HostState { return loadStateResult().state; }
export function saveState(state: HostState): { ok: true } | { ok: false; error: string } {
  try { localStorage.setItem(KEY, JSON.stringify(validateState(state))); return { ok: true }; }
  catch { return { ok: false, error: "Не удалось сохранить изменения в браузере. Экспортируй продолжение, чтобы сохранить работу." }; }
}
export function patchTurn(turn: Turn, patch: Partial<Turn>): Turn {
  const updated = { ...turn, ...patch, id: turn.id, createdAt: turn.createdAt };
  if (updated.intent !== turn.intent) { updated.result = undefined; updated.verified = false; }
  else if (updated.result !== turn.result) updated.verified = false;
  if (!updated.result?.trim()) updated.verified = false;
  return updated;
}
export function serializePacket(state: HostState): string {
  const text = JSON.stringify({ schema: "mondayid.continuity.v1", exportedAt: new Date().toISOString(), state: validateState(state) }, null, 2);
  if (new TextEncoder().encode(text).length > MAX_PACKET_BYTES) throw new Error("Продолжение превышает 5 МБ.");
  return text;
}
export function parsePacket(text: string): HostState {
  if (new TextEncoder().encode(text).length > MAX_PACKET_BYTES) throw new Error("Файл превышает 5 МБ.");
  let packet: unknown;
  try { packet = JSON.parse(text); } catch { throw new Error("Файл не является корректным JSON."); }
  if (!object(packet) || packet.schema !== "mondayid.continuity.v1") throw new Error("Неподдерживаемый формат продолжения.");
  return validateState(packet.state);
}
export function newTurn(request: string): Turn {
  const trimmed = request.trim();
  return {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(), request: trimmed,
    intent: trimmed, context: [], decision: "Обрабатываю запрос…", verified: false
  };
}
export function exportPacket(state: HostState) {
  const payload = serializePacket(state);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `mondayid-continuity-${Date.now()}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
