import type {
  PrBodyHeadClaim,
  PrBodyHeadClaimKind,
  PrBodyHeadClaimVerdict,
} from "./pr-body-head-drift-boundary.js";

export interface PrBodyHeadClaimExtractorInput {
  body: string;
  max_claims?: number;
}

export interface PrBodyHeadClaimExtractorVerdict {
  ok: boolean;
  claims: PrBodyHeadClaim[];
  ignored_head_lines: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const HEAD_SHA_PATTERN = /\b[0-9a-f]{40}\b/gi;

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function claimKind(line: string): PrBodyHeadClaimKind | null {
  const lower = line.toLowerCase();

  if (lower.includes("repaired-head") || lower.includes("repaired head") || lower.includes("repair applied")) {
    return "repaired_head";
  }

  if (lower.includes("status readback") || lower.includes("checks surface") || lower.includes("check groups")) {
    return "status_readback_head";
  }

  if (lower.includes("blocker") || lower.includes("failed step") || lower.includes("failure")) {
    return "blocker_head";
  }

  if (
    lower.includes("current head") ||
    lower.includes("current-head") ||
    lower.includes("current pr head") ||
    lower.includes("pr #2 has moved") ||
    lower.includes("live pr head")
  ) {
    return "current_head";
  }

  return null;
}

function claimVerdict(line: string): PrBodyHeadClaimVerdict {
  const lower = line.toLowerCase();

  if (lower.includes("passing_with_warnings") || lower.includes("succeeded") || lower.includes("success")) {
    return lower.includes("warning") ? "passing_with_warnings" : "passing";
  }

  if (lower.includes("failed") || lower.includes("failure") || lower.includes("error")) return "failing";
  if (lower.includes("pending") || lower.includes("queued") || lower.includes("in progress")) return "pending";
  if (lower.includes("closed") || lower.includes("completed") || lower.includes("resolved")) return "resolved";

  return "unknown";
}

function headShas(line: string): string[] {
  return [...new Set([...line.matchAll(HEAD_SHA_PATTERN)].map((match) => match[0].toLowerCase()))];
}

function claimId(kind: PrBodyHeadClaimKind, sha: string, index: number): string {
  return `${kind}-${index + 1}-${sha.slice(0, 12)}`;
}

export function extractPrBodyHeadClaims(input: PrBodyHeadClaimExtractorInput): PrBodyHeadClaimExtractorVerdict {
  const maxClaims = input.max_claims ?? 24;
  const claims: PrBodyHeadClaim[] = [];
  const ignoredHeadLines: string[] = [];
  const seen = new Set<string>();

  if (!Number.isInteger(maxClaims) || maxClaims < 1) {
    return {
      ok: false,
      claims: [],
      ignored_head_lines: [],
      decisive_evidence: [],
      blockers: ["max_claims must be a positive integer"],
      next_route: "supply a bounded positive claim extraction limit before routing PR body status text",
    };
  }

  for (const rawLine of input.body.split(/\r?\n/)) {
    const line = normalizeLine(rawLine);
    if (!line) continue;

    const shas = headShas(line);
    if (shas.length === 0) continue;

    const kind = claimKind(line);
    if (!kind) {
      ignoredHeadLines.push(line);
      continue;
    }

    for (const sha of shas) {
      const key = `${kind}:${sha}:${line}`;
      if (seen.has(key)) continue;
      seen.add(key);

      claims.push({
        claim_id: claimId(kind, sha, claims.length),
        kind,
        head_sha: sha,
        verdict: claimVerdict(line),
        evidence: line,
      });

      if (claims.length >= maxClaims) {
        return {
          ok: true,
          claims,
          ignored_head_lines: ignoredHeadLines,
          decisive_evidence: claims.map((claim) => `${claim.claim_id}:${claim.kind}@${claim.head_sha}`),
          blockers: [],
          next_route: "feed extracted PR-body head claims into the PR body head drift boundary before trusting PR prose",
        };
      }
    }
  }

  return {
    ok: true,
    claims,
    ignored_head_lines: ignoredHeadLines,
    decisive_evidence: claims.map((claim) => `${claim.claim_id}:${claim.kind}@${claim.head_sha}`),
    blockers: [],
    next_route:
      claims.length > 0
        ? "feed extracted PR-body head claims into the PR body head drift boundary before trusting PR prose"
        : "treat PR body as non-status prose unless a direct status surface or live-head claim is attached",
  };
}
