import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ProviderUnavailableError, createGitHubTools } from "../runtime/mondayid-agent.mjs";
import { createAgentBrowserWorkupOrgan } from "./agent-browser-workup-capability.mjs";
import { createContainerWorkspaceExecutor } from "./container-workspace-executor.mjs";
import { createFileWorkJournal } from "./file-work-journal.mjs";
import { createMondayIDAgentWorkFactory } from "./mondayid-agent-work-adapter.mjs";
import { createProcessWorkspaceExecutor } from "./process-workspace-executor.mjs";
import { createComputeRouter, createWorklessRuntimeV2 } from "./workless-runtime-v2.mjs";

const githubToken = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
if (!githubToken || !repository || !branch) throw new Error("held-out WorkUp proof requires GitHub Actions context");

const temp = await mkdtemp(join(tmpdir(), "workup-heldout-"));
const journalPath = join(temp, "journal.json");
const workspace = join(temp, "workspace");
await import("node:fs/promises").then(({ mkdir }) => mkdir(workspace, { recursive: true }));

const browserExecutor = createProcessWorkspaceExecutor({
  root: process.cwd(),
  allowedCommands: ["agent-browser"],
  defaultTimeoutMs: 60_000,
});
const browser = createAgentBrowserWorkupOrgan(browserExecutor);
const container = createContainerWorkspaceExecutor({
  root: workspace,
  profiles: { python: { image: "python:3.12-slim", commands: ["python3"] } },
});

const rawGitHubRead = createGitHubTools({ token: githubToken, repository })
  .find((tool) => tool.name === "github_read_file");
if (!rawGitHubRead) throw new Error("existing MondayID GitHub read tool is unavailable");

const evidence = {};
const tools = [
  {
    name: "python_isolated",
    description: "Run a deterministic Python check inside the isolated WorkUp container.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async execute() {
      const output = await container.run({
        profile: "python",
        command: "python3",
        args: ["-c", "print(6*7)"],
      });
      evidence.python = output;
      return output;
    },
  },
  {
    name: "browser_probe",
    description: "Open the public browser test page and read it back.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async execute() {
      const opened = await browser.run({ operation: "open", url: "https://example.com/" });
      const body = await browser.run({ operation: "read", ref: "body" });
      const output = { opened, body };
      evidence.browser = output;
      return output;
    },
  },
  {
    name: "github_probe",
    description: "Read the WorkUp contract back from the live GitHub repository.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async execute() {
      const output = await rawGitHubRead.execute({
        path: "platform/docs/MONDAYID_WORKLESS_RUNTIME_V2.md",
        ref: branch,
      });
      evidence.github = output;
      return { path: output.path, sha: output.sha, contentPrefix: output.content.slice(0, 500) };
    },
  },
];

const astra = {
  id: "astra",
  async complete() {
    throw new ProviderUnavailableError("held-out quota boundary", {
      providerId: "astra",
      code: "quota_or_rate_limit",
      retryable: true,
    });
  },
};

const sol = {
  id: "sol",
  async complete({ messages }) {
    const completedTools = messages.filter((message) => message.role === "tool").length;
    const call = (id, name) => ({
      role: "assistant",
      content: null,
      tool_calls: [{ id, type: "function", function: { name, arguments: "{}" } }],
    });
    if (completedTools === 0) return call("heldout-python", "python_isolated");
    if (completedTools === 1) return call("heldout-browser", "browser_probe");
    if (completedTools === 2) return call("heldout-github", "github_probe");
    return { role: "assistant", content: "WORKUP_HELDOUT_E2E_COMPLETE" };
  },
};

const journal = createFileWorkJournal(journalPath);
const runtime = createWorklessRuntimeV2({
  journal,
  computeRouter: createComputeRouter([
    { id: "astra", kind: "model", priority: 1, capabilities: ["reason"] },
    { id: "sol", kind: "model", priority: 2, capabilities: ["reason"] },
  ]),
  policy: { requiredCapabilities: ["reason"] },
  workFactory: createMondayIDAgentWorkFactory({
    providerAdapters: new Map([["astra", astra], ["sol", sol]]),
    tools,
    maxTurns: 6,
    verifyCandidate({ provider, candidate }) {
      const accepted =
        provider.id === "sol" &&
        candidate.result === "WORKUP_HELDOUT_E2E_COMPLETE" &&
        evidence.python?.status === "completed" &&
        evidence.python?.stdout?.trim() === "42" &&
        evidence.python?.isolation?.network === "none" &&
        evidence.browser?.opened?.status === "completed" &&
        /example\.com/i.test(evidence.browser?.opened?.postUrl ?? "") &&
        /Example Domain/i.test(evidence.browser?.body?.observableResult ?? "") &&
        evidence.github?.path === "platform/docs/MONDAYID_WORKLESS_RUNTIME_V2.md" &&
        /Workless Runtime v2/.test(evidence.github?.content ?? "");
      return {
        accepted,
        verifier: "held-out-cross-organ-verifier",
        evidence: [
          "isolated Python returned 42 with network none",
          "live browser read Example Domain",
          "live GitHub read recovered WorkUp contract",
        ],
      };
    },
  }),
});

try {
  const result = await runtime.run({
    instruction: "finish this job across quota failure using the required execution organs",
  });

  assert.equal(result.status, "complete");
  assert.equal(result.providerId, "sol");
  assert.deepEqual(result.routeAttempts.map((attempt) => attempt.providerId), ["astra", "sol"]);
  assert.equal(result.routeAttempts[0].result.blocker, "rate_limit");
  assert.equal(result.final.verification.accepted, true);
  assert.equal(result.final.trace.length, 3);
  assert.deepEqual(result.final.trace.map((entry) => entry.tool), ["python_isolated", "browser_probe", "github_probe"]);

  const freshJournal = createFileWorkJournal(journalPath);
  const recovered = await freshJournal.read(result.jobId);
  assert.equal(recovered.status, "complete");
  assert.equal(recovered.jobId, result.jobId);
  assert.equal(recovered.events.some((event) => event.phase === "compute_reroute" && event.fromProviderId === "astra"), true);
  assert.equal(recovered.events.some((event) => event.phase === "compute_route" && event.providerId === "sol"), true);

  console.log(JSON.stringify({
    result: "WORKUP_HELDOUT_E2E_PROOF_PASS",
    jobId: result.jobId,
    route: ["astra:quota", "sol", "python:isolated", "browser:live", "github:live", "verifier", "durable-readback"],
    receiptId: result.final.receiptId,
  }));
} finally {
  await browser.run({ operation: "close" });
  await rm(temp, { recursive: true, force: true });
}
