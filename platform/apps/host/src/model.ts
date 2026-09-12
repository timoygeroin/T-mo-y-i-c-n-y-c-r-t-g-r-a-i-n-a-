export type Phase = "intent" | "context" | "action" | "verification";
export type Turn = {
  id: string; createdAt: string; request: string; intent: string; context: string[];
  decision: string; result?: string; verified: boolean;
};
export type HostState = { version: 1; turns: Turn[]; activeId?: string };

const KEY = "mondayid.host.v1";
export function loadState(): HostState {
  try { const parsed = JSON.parse(localStorage.getItem(KEY) ?? ""); if (parsed.version === 1) return parsed; } catch {}
  return { version: 1, turns: [] };
}
export function saveState(state: HostState) { localStorage.setItem(KEY, JSON.stringify(state)); }
export function newTurn(request: string): Turn {
  const trimmed = request.trim();
  return {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(), request: trimmed,
    intent: trimmed, context: ["Текущий разговор", "Канон MondayID"],
    decision: "Намерение зафиксировано. Для исполнения выбери следующий точный ход.", verified: false
  };
}
export function exportPacket(state: HostState) {
  const payload = JSON.stringify({ schema: "mondayid.continuity.v1", exportedAt: new Date().toISOString(), state }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `mondayid-continuity-${Date.now()}.json`; anchor.click();
  URL.revokeObjectURL(url);
}
