import { createHash } from "node:crypto";

function freeze(value) {
  return Object.freeze(value);
}

function hash(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
}

function requireExecutor(executor) {
  if (!executor || typeof executor.run !== "function") {
    throw new TypeError("agent-browser WorkUp capability requires executor.run()");
  }
}

function commandFor(request) {
  switch (request?.operation) {
    case "open":
      if (!request.url) throw new TypeError("browser open requires url");
      return ["open", request.url];
    case "snapshot":
      return ["snapshot", "-i"];
    case "click":
      if (!request.ref) throw new TypeError("browser click requires ref");
      return ["click", request.ref];
    case "fill":
      if (!request.ref || request.value == null) throw new TypeError("browser fill requires ref and value");
      return ["fill", request.ref, String(request.value)];
    case "select":
      if (!request.ref || request.option == null) throw new TypeError("browser select requires ref and option");
      return ["select", request.ref, String(request.option)];
    case "press":
      if (!request.key) throw new TypeError("browser press requires key");
      return ["press", request.key];
    case "read":
      return ["get", "text", request.ref ?? "body"];
    case "url":
      return ["get", "url"];
    case "close":
      return ["close"];
    default:
      throw new Error(`unsupported browser operation: ${request?.operation ?? "missing"}`);
  }
}

const MUTATING_BROWSER_OPERATIONS = new Set(["open", "click", "fill", "select", "press"]);

export function createAgentBrowserWorkupOrgan(executor) {
  requireExecutor(executor);
  let stepIndex = 0;

  async function executeCommand(args) {
    return executor.run({ command: "agent-browser", args });
  }

  async function safeUrl() {
    const result = await executeCommand(["get", "url"]);
    return result.status === "completed" ? result.stdout.trim() || null : null;
  }

  async function run(request) {
    const args = commandFor(request);
    const mutates = MUTATING_BROWSER_OPERATIONS.has(request.operation);
    const preUrl = request.operation === "open" ? await safeUrl() : await safeUrl();
    const execution = await executeCommand(args);
    stepIndex += 1;

    if (execution.status !== "completed") {
      return freeze({
        status: "failed",
        code: execution.code ?? "browser_command_failed",
        operation: request.operation,
        execution,
        receiptId: `browser-failure:${hash({ stepIndex, request, execution })}`,
      });
    }

    const postUrl = request.operation === "close" ? null : await safeUrl();
    const observableResult = execution.stdout.trim();
    const receipt = freeze({
      receiptId: `workup-browser:${hash({ stepIndex, request, preUrl, postUrl, observableResult })}`,
      stepIndex,
      requestedAction: freeze({ ...request }),
      preUrl,
      postUrl,
      observableResult,
      mutationClass: mutates ? "browser_state" : "read_only",
    });

    return freeze({ status: "completed", ...receipt });
  }

  return freeze({
    id: "workup.agent-browser-organ.v1",
    lineage: "MondayBrowserOrgan v1",
    engine: "agent-browser",
    run,
  });
}

export function createAgentBrowserWorkupCapability(executor) {
  const organ = createAgentBrowserWorkupOrgan(executor);

  return freeze({
    id: "workup.browser",
    platform: "agent-browser",
    provides: [
      "browser.open",
      "browser.snapshot",
      "browser.click",
      "browser.fill",
      "browser.select",
      "browser.press",
      "browser.read",
      "browser.url",
    ],
    risk: "medium",
    mutates: true,
    cost: 2,
    latency: 2,
    async execute(input = {}) {
      const request = input.browserRequest ?? input.intent?.browserRequest ?? input.task?.browserRequest;
      if (!request) {
        const error = new Error("WorkUp browser capability requires browserRequest");
        error.code = "browser_request_missing";
        throw error;
      }
      const result = await organ.run(request);
      return freeze({
        toolId: "workup.browser",
        platforms: ["agent-browser"],
        result,
      });
    },
  });
}
