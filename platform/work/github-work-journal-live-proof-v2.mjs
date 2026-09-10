import assert from "node:assert/strict";
import { createGitHubWorkJournal } from "./github-work-journal.mjs";

const accessToken = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
const runId = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;
if (!accessToken || !repository || !branch) throw new Error("missing GitHub Actions runtime context");

const path = `workup-runtime-state/live-proof-${runId}.json`;
const makeJournal = () => createGitHubWorkJournal({ repository, branch, path, token: accessToken });
const first = makeJournal();

try {
  const task = { instruction: "prove remote WorkUp continuity" };
  const jobId = await first.open(task);                         // revision 1
  await first.append(jobId, { phase: "observation", value: "client-a" }); // r2
  await first.steer(jobId, { constraint: "preserve remote state" });       // r3

  const second = makeJournal();
  const recovered = await second.read(jobId);
  assert.equal(recovered.jobId, jobId);
  assert.equal(recovered.status, "running");
  assert.deepEqual(recovered.originalTask, task);
  assert.deepEqual(recovered.steering[0].update, { constraint: "preserve remote state" });

  const steering = await second.consumeSteering(jobId);        // revision 4
  assert.deepEqual(steering.map((x) => x.update), [{ constraint: "preserve remote state" }]);
  await second.setActiveTask(jobId, {                          // revision 5
    instruction: task.instruction,
    steering: steering.map((x) => x.update),
  });

  const third = makeJournal();
  const recoveredAgain = await third.read(jobId);
  assert.deepEqual(recoveredAgain.steering, []);
  assert.deepEqual(recoveredAgain.activeTask.steering, [{ constraint: "preserve remote state" }]);

  await third.close(jobId, "complete", { proof: "remote-readback", jobId }); // revision 6
  const fourth = makeJournal();
  const closed = await fourth.read(jobId);
  const snapshot = await fourth.snapshot();
  assert.equal(closed.status, "complete");
  assert.equal(closed.result.proof, "remote-readback");
  assert.equal(snapshot.revision, 6);

  console.log(JSON.stringify({ result: "WORKUP_GITHUB_JOURNAL_LIVE_PROOF_PASS", revision: 6, jobId }));
} finally {
  const result = await makeJournal().destroy();
  assert.ok(["deleted", "already_absent"].includes(result.status));
}
