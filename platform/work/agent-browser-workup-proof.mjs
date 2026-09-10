import assert from "node:assert/strict";

import { createAgentBrowserWorkupOrgan } from "./agent-browser-workup-capability.mjs";
import { createProcessWorkspaceExecutor } from "./process-workspace-executor.mjs";

const executor = createProcessWorkspaceExecutor({
  root: process.cwd(),
  allowedCommands: ["agent-browser"],
  defaultTimeoutMs: 60_000,
});
const browser = createAgentBrowserWorkupOrgan(executor);

try {
  const opened = await browser.run({ operation: "open", url: "https://example.com/" });
  assert.equal(opened.status, "completed");
  assert.match(opened.postUrl ?? "", /example\.com/);
  assert.equal(opened.mutationClass, "browser_state");
  assert.match(opened.receiptId, /^workup-browser:/);

  const body = await browser.run({ operation: "read", ref: "body" });
  assert.equal(body.status, "completed");
  assert.match(body.observableResult, /Example Domain/i);
  assert.equal(body.mutationClass, "read_only");

  const snapshot = await browser.run({ operation: "snapshot" });
  assert.equal(snapshot.status, "completed");
  assert.ok(snapshot.observableResult.length > 0);

  const currentUrl = await browser.run({ operation: "url" });
  assert.equal(currentUrl.status, "completed");
  assert.match(currentUrl.observableResult, /example\.com/);

  console.log("WORKUP_BROWSER_PROOF_PASS 4/4");
} finally {
  await browser.run({ operation: "close" });
}
