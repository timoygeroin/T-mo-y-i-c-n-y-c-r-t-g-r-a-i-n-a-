export type RevenueCorpusTier =
  | "direct_current_instruction"
  | "dima_authored_archive"
  | "raw_chat_export"
  | "code_artifact"
  | "archive_derived"
  | "memory"
  | "model_summary";

export type RevenueSignalType =
  | "capability"
  | "product"
  | "constraint"
  | "proof"
  | "personal_context";

export type RevenueVisibility = "private" | "sanitized_public" | "public";

export interface RevenueCorpusItem {
  item_id: string;
  tier: RevenueCorpusTier;
  reference: string;
  signal_type: RevenueSignalType;
  value: string;
  visibility: RevenueVisibility;
  reusable: boolean;
}

export interface RevenueCorpusInput {
  corpus_id: string;
  items: RevenueCorpusItem[];
}

export interface RevenueCorpusVerdict {
  ok: boolean;
  corpus_id: string | null;
  authoritative_items: RevenueCorpusItem[];
  private_ledger: RevenueCorpusItem[];
  public_proof_candidates: RevenueCorpusItem[];
  capability_signals: string[];
  product_signals: string[];
  constraints: string[];
  blockers: string[];
  next_route: string;
}

const AUTHORITY_TIERS = new Set<RevenueCorpusTier>([
  "direct_current_instruction",
  "dima_authored_archive",
  "raw_chat_export",
  "code_artifact",
]);

function clean(value: string): string {
  return value.trim();
}

function rank(tier: RevenueCorpusTier): number {
  switch (tier) {
    case "direct_current_instruction":
      return 1;
    case "dima_authored_archive":
      return 2;
    case "raw_chat_export":
      return 3;
    case "code_artifact":
      return 4;
    case "archive_derived":
      return 5;
    case "memory":
      return 6;
    case "model_summary":
      return 7;
  }
}

function normalizeItems(items: RevenueCorpusItem[]): RevenueCorpusItem[] {
  const seen = new Set<string>();
  const normalized: RevenueCorpusItem[] = [];

  for (const item of items) {
    const item_id = clean(item.item_id);
    const reference = clean(item.reference);
    const value = clean(item.value);
    if (!item_id || !reference || !value || seen.has(item_id)) continue;
    seen.add(item_id);
    normalized.push({ ...item, item_id, reference, value });
  }

  return normalized.sort((left, right) => rank(left.tier) - rank(right.tier));
}

function uniqueSignals(items: RevenueCorpusItem[], type: RevenueSignalType): string[] {
  return [...new Set(items.filter((item) => item.signal_type === type).map((item) => item.value))];
}

export function compileRevenueCorpus(input: RevenueCorpusInput): RevenueCorpusVerdict {
  const corpusId = clean(input.corpus_id);
  const items = normalizeItems(input.items);
  const blockers: string[] = [];
  const authoritativeItems = items.filter((item) => AUTHORITY_TIERS.has(item.tier));

  if (!corpusId) blockers.push("revenue corpus has no id");
  if (items.length === 0) blockers.push("revenue corpus has no usable items");
  if (authoritativeItems.length === 0) blockers.push("revenue corpus has no direct instruction, authored archive, raw chat export, or code artifact authority");
  if (items.length > 0 && items.every((item) => item.tier === "model_summary")) {
    blockers.push("model summary cannot be the sole revenue corpus authority");
  }

  const privateLedger = items.filter(
    (item) => item.visibility === "private" || item.signal_type === "personal_context",
  );
  const publicProofCandidates = items.filter(
    (item) =>
      item.reusable &&
      item.signal_type !== "personal_context" &&
      (item.visibility === "public" || item.visibility === "sanitized_public"),
  );

  return {
    ok: blockers.length === 0,
    corpus_id: corpusId || null,
    authoritative_items: authoritativeItems,
    private_ledger: privateLedger,
    public_proof_candidates: publicProofCandidates,
    capability_signals: uniqueSignals(items, "capability"),
    product_signals: uniqueSignals(items, "product"),
    constraints: uniqueSignals(items, "constraint"),
    blockers,
    next_route:
      blockers.length === 0
        ? "feed private signals into qualification and delivery; publish only sanitized proof candidates"
        : "repair corpus authority before using chat history as a revenue claim",
  };
}
