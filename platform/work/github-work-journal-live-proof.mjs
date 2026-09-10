import assert from "node:assert/strict";

import { createGitHubWorkJournal } from "./github-work-journal.mjs";

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
const runId = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;

if (!token || !repository || !branch) {
  throw new Error("live GitHub journal proof requires GITHUB_TOKEN, GITHUB_REPOSITORY and branch context");
}

const path = `workup-runtime-state/live-proof-${runId}.json`;
const journalA = createGitHubWorkJournal({ repository, branch, path, token });

try {
  const task = { instruction: "prove WorkUp state survives a fresh client through remote GitHub state" };
  const jobId = await journalA.open(task);
  await journalA.append(jobId, { phase: "remote-observation", value: "first-client" });
  await journalA.steer(jobId, { constraint: "preserve remote state" });

  const journalB = createGitHubWorkJournal({ repository, branch, path, token });
  const recoveredByFreshClient = await journalB.read(jobId);
  assert.equal(recoveredByFreshClient.jobId, jobId);
  assert.equal(recoveredByFreshClient.status, "running");
  assert.deepEqual(recoveredByFreshClient.originalTask, task);
  assert.equal(
    recoveredByFreshClient.events.some((event) => event.phase === "remote-observation" && event.value === "first-client"),
    true,
  );
  assert.deepEqual(recoveredByFreshClient.steering[0].update, { constraint: "preserve remote state" });

  const steering = await journalB.consumeSteering(jobId);
  assert.deepEqual(steering.map((entry) => entry.update), [{ constraint: "preserve remote state" }]);
  await journalB.setActiveTask(jobId, {
    instruction: task.instruction,
    steering: steering.map((entry) => entry.update),
  });

  const journalC = createGitHubWorkJournal({ repository, branch, path, token });
  const recoveredAgain = await journalC.read(jobId);
  assert.deepEqual(recoveredAgain.steering, []);
  assert.deepEqual(recoveredAgain.activeTask.steering, [{ constraint: "preserve remote state" }]);

  await journalC.close(jobId, "complete", {
    proof: "remote-state-readback",
    jobId,
  });

  const journalD = createGitHubWorkJournal({ repository, branch, path, token });
  const closed = await journalD.read(jobId);
  assert.equal(closed.status, "complete");
  assert.equal(closed.result.proof, "remote-state-readback");
  assert.equal((await journalD.snapshot()).revision >= 7, true);

  console.log(JSON.stringify({
    result: "WORKUP_GITHUB_JOURNAL_LIVE_PROOF_PASS",
    checks: 11,
    repository,
    branch,
    path,
    jobId,
  }));
} finally {
  const cleanup = createGitHubWorkJournal({ repository, branch, path, token });
  const result = await cleanup.destroy();
  assert.ok(["deleted", "already_absent"].includes(result.status));
}
