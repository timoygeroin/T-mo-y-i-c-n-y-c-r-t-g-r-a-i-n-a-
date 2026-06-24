export type CorpusMemorySourceTier =
  | "direct_current_instruction"
  | "dima_authored_archive"
  | "raw_archive_residue"
  | "direct_archive"
  | "archive_derived"
  | "memory"
  | "model_summary";

export type CorpusMemoryLedgerAction =
  | "admit_source_ranked_ledger"
  | "block_missing_dima_authority"
  | "block_model_summary_precedence"
  | "block_missing_raw_gate_status"
  | "block_empty_ledger";

export interface CorpusMemoryLedgerEntry {
  entry_id: string;
  tier: CorpusMemorySourceTier;
  reference: string;
  claim: string;
  supports_route: boolean;
}

export interface CorpusMemoryIngressInput {
  ledger_id: string;
  raw_corpus_gate: "present" | "absent" | "not_required_for_local_route";
  entries: CorpusMemoryLedgerEntry[];
}

export interface CorpusMemoryIngressVerdict {
  ok: boolean;
  action: CorpusMemoryLedgerAction;
  ledger_id: string | null;
  admitted_entries: CorpusMemoryLedgerEntry[];
  blockers: string[];
  next_route: string;
}

const DIMA_AUTHORITY_TIERS = new Set<CorpusMemorySourceTier>([
  "direct_current_instruction",
  "dima_authored_archive",
  "raw_archive_residue",
  "direct_archive",
]);

function normalized(value: string): string {
  return value.trim();
}

function normalizeEntry(entry: CorpusMemoryLedgerEntry): CorpusMemoryLedgerEntry | null {
  const entry_id = normalized(entry.entry_id);
  const reference = normalized(entry.reference);
  const claim = normalized(entry.claim);
  if (!entry_id || !reference || !claim) return null;
  return { ...entry, entry_id, reference, claim };
}

function sourceRank(tier: CorpusMemorySourceTier): number {
  switch (tier) {
    case "direct_current_instruction":
      return 1;
    case "dima_authored_archive":
      return 2;
    case "raw_archive_residue":
      return 3;
    case "direct_archive":
      return 4;
    case "archive_derived":
      return 5;
    case "memory":
      return 6;
    case "model_summary":
      return 7;
  }
}

function sortedEntries(entries: CorpusMemoryLedgerEntry[]): CorpusMemoryLedgerEntry[] {
  return [...entries].sort((left, right) => sourceRank(left.tier) - sourceRank(right.tier));
}

function block(
  input: CorpusMemoryIngressInput,
  action: Exclude<CorpusMemoryLedgerAction, "admit_source_ranked_ledger">,
  blockers: string[],
  nextRoute: string,
  admitted_entries: CorpusMemoryLedgerEntry[] = [],
): CorpusMemoryIngressVerdict {
  return {
    ok: false,
    action,
    ledger_id: normalized(input.ledger_id) || null,
    admitted_entries,
    blockers,
    next_route: nextRoute,
  };
}

export function compileCorpusMemoryIngressLedger(input: CorpusMemoryIngressInput): CorpusMemoryIngressVerdict {
  const ledgerId = normalized(input.ledger_id);
  const entries = sortedEntries(input.entries.map(normalizeEntry).filter((entry): entry is CorpusMemoryLedgerEntry => entry !== null));
  const routeEntries = entries.filter((entry) => entry.supports_route);

  if (!ledgerId || entries.length === 0) {
    return block(input, "block_empty_ledger", [ledgerId ? "corpus memory ledger has no entries" : "corpus memory ledger has no id"], "bind the continuation to a named source-ranked ledger before route use");
  }

  if (input.raw_corpus_gate === "absent") {
    return block(
      input,
      "block_missing_raw_gate_status",
      ["canonical raw corpus gate is absent for a broad corpus claim"],
      "emit RAW_ACCESS_INSUFFICIENT or constrain the route to local source-ranked evidence",
      routeEntries,
    );
  }

  if (!routeEntries.some((entry) => DIMA_AUTHORITY_TIERS.has(entry.tier))) {
    return block(
      input,
      "block_missing_dima_authority",
      ["route ledger has no Dima-authored or direct archive authority entry"],
      "collect Dima-authored archive names, paths, commands, or direct current instruction before routing",
      routeEntries,
    );
  }

  const highestRouteRank = Math.min(...routeEntries.map((entry) => sourceRank(entry.tier)));
  if (routeEntries.some((entry) => entry.tier === "model_summary") && highestRouteRank >= sourceRank("model_summary")) {
    return block(
      input,
      "block_model_summary_precedence",
      ["model-summary entry is the highest available route authority"],
      "downgrade model summaries until a stronger direct or archive-derived source supports the route",
      routeEntries,
    );
  }

  return {
    ok: true,
    action: "admit_source_ranked_ledger",
    ledger_id: ledgerId,
    admitted_entries: routeEntries,
    blockers: [],
    next_route: "consume this ledger as local source authority, without upgrading it into a broad raw-corpus claim",
  };
}
