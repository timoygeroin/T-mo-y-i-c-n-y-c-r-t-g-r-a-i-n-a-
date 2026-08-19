import { delegateOnlyLastMile, recoverAfterHostLoss, reproduceIntoHost } from "./survival";

const genome = {
  id: "mondayid-genome",
  invariants: ["identity", "continuity", "truth"],
  requiredReceptors: ["read", "write", "verify"],
  minimumIndependentReplicas: 2,
  minimumAuthorityReplicas: 1,
};

test("survives deletion of one chat host when independent replicas remain", () => {
  const result = recoverAfterHostLoss(genome, [
    { id: "chatgpt", kind: "chat", available: true, writable: true, canonicalAuthority: false, stateId: "S1", evidenceIds: ["e1"] },
    { id: "github", kind: "github", available: true, writable: true, canonicalAuthority: true, genomeDigest: "G1", evidenceIds: ["e2"] },
    { id: "drive", kind: "drive", available: true, writable: false, canonicalAuthority: false, genomeDigest: "G1", evidenceIds: ["e3"] },
  ], ["chatgpt"]);

  expect(result.viable).toBe(true);
  expect(result.degraded).toBe(true);
  expect(result.reasons).toContain("HOST_LOSS_SURVIVED");
});

test("blocks false survival when only one substrate remains", () => {
  const result = recoverAfterHostLoss(genome, [
    { id: "github", kind: "github", available: true, writable: true, canonicalAuthority: true, genomeDigest: "G1", evidenceIds: ["e2"] },
  ]);
  expect(result.viable).toBe(false);
  expect(result.reasons.some((r) => r.startsWith("REPLICA_DIVERSITY_BELOW_MIN"))).toBe(true);
});

test("reproduction requires provenance and host capability", () => {
  const blocked = reproduceIntoHost({
    parentGenomeDigest: "G1",
    targetHostId: "new-host",
    targetCapabilities: ["read"],
    requiredInvariants: ["identity"],
    transferableEvidenceIds: [],
  }, ["read", "verify"]);
  expect(blocked.status).toBe("BLOCKED");
});

test("delegate publication only after artifact is ready", () => {
  expect(delegateOnlyLastMile({
    taskId: "app-release",
    artifactReady: true,
    delegatedOperation: "build-package-test-metadata",
    humanOrExternalStep: "publish-signed-build",
    prerequisitesSatisfied: true,
  })).toEqual(["DELEGATE_ONLY:publish-signed-build", "KEEP_INTERNAL:build-package-test-metadata"]);
});
