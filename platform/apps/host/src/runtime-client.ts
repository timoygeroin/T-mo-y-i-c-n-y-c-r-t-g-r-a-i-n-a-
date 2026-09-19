export type RuntimeMove = {
  classification: { primary: string };
  route: { mode: string; blocker: string | null; proof_requirement: string };
  gates: { human: string; architecture_visible: boolean };
};

export type RuntimeReply = {
  answer: string;
  model: string;
  response_id: string | null;
  move: RuntimeMove;
  receipt: {
    type: "openai_response";
    provider: string;
    transport: "vercel_ai_gateway" | "direct_openai";
    auth_source: string;
    response_id: string | null;
    model: string;
    external_effect_verified: false;
  };
};

export type RuntimeHealth = {
  ok: boolean;
  kernel: string;
  model: string;
  model_transport_available: boolean;
  preferred_transport: "vercel_ai_gateway" | "direct_openai" | null;
  vercel_oidc_available?: boolean;
  runtime?: string;
};

export async function askMondayRuntime(message: string, context: Record<string, unknown> = {}): Promise<RuntimeReply> {
  const response = await fetch("/api/organism/respond", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, context })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Runtime HTTP ${response.status}`);
  return payload as RuntimeReply;
}

export async function readRuntimeHealth(): Promise<RuntimeHealth> {
  const response = await fetch("/api/organism/health", { headers: { accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Runtime HTTP ${response.status}`);
  return payload as RuntimeHealth;
}
