import { createHash } from "node:crypto";
import type { ContinuityCheckpoint } from "./index.js";

export interface RecoveryRequest {
  account_id: string;
  surface: "chat" | "work";
  policy_version: string;
  source_manifest_hash: string;
  max_bytes?: number;
}

export interface RecoveryReceipt {
  revision: number;
  fingerprint: string;
  packet: string;
  sources: string[];
  missing: string[];
  cache_hit: boolean;
  model_calls: 0;
}

export interface RecoveryDependencies {
  authorize(accountId: string): Promise<boolean> | boolean;
  readCheckpoint(accountId: string): Promise<ContinuityCheckpoint> | ContinuityCheckpoint;
}

/** A host-owned cache. Authorization and the account-scoped store remain mandatory. */
export function createRecoveryService(dependencies: RecoveryDependencies) {
  const cache = new Map<string, Omit<RecoveryReceipt, "cache_hit">>();

  return {
    async recover(request: RecoveryRequest): Promise<RecoveryReceipt> {
      const { account_id, surface, policy_version, source_manifest_hash } = request;
      if (!account_id?.trim() || !["chat", "work"].includes(surface)
        || !policy_version?.trim() || !source_manifest_hash?.trim()) {
        throw new TypeError("Recovery requires account, surface, policy version and source manifest hash");
      }
      if (!await dependencies.authorize(account_id)) {
        throw new Error("Recovery access denied");
      }

      const checkpoint = await dependencies.readCheckpoint(account_id);
      if (!checkpoint?.ok || !checkpoint.fingerprint || !checkpoint.boot_packet) {
        throw new Error("No verified checkpoint for this account");
      }
      const maxBytes = request.max_bytes ?? 8192;
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
        throw new TypeError("max_bytes must be a positive integer");
      }
      if (Buffer.byteLength(checkpoint.boot_packet, "utf8") > maxBytes) {
        throw new Error("Checkpoint packet exceeds recovery budget");
      }

      // Surface is deliberately absent: Chat and Work recover the same organism state.
      const key = createHash("sha256").update(JSON.stringify([
        account_id, checkpoint.fingerprint, policy_version, source_manifest_hash,
      ])).digest("hex");
      const existing = cache.get(key);
      if (existing) return { ...existing, cache_hit: true };

      const result: Omit<RecoveryReceipt, "cache_hit"> = {
        revision: checkpoint.sequence,
        fingerprint: checkpoint.fingerprint,
        packet: checkpoint.boot_packet,
        sources: checkpoint.artifacts.filter((item) => item.status === "present").map((item) => item.artifact_id),
        missing: checkpoint.artifacts.filter((item) => item.status !== "present").map((item) => item.artifact_id),
        model_calls: 0,
      };
      cache.set(key, result);
      return { ...result, cache_hit: false };
    },
  };
}
