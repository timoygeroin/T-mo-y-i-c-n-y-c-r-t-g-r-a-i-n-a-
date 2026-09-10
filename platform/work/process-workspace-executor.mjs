import { execFile } from "node:child_process";
import { resolve, sep } from "node:path";

function freeze(value) {
  return Object.freeze(value);
}

function normalizeRoot(root) {
  if (!root) throw new TypeError("workspace executor requires root");
  return resolve(root);
}

function inside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

export function createProcessWorkspaceExecutor({
  root,
  allowedCommands = ["python3", "node", "bash", "sh", "git"],
  defaultTimeoutMs = 30_000,
  maxBufferBytes = 4 * 1024 * 1024,
  env = process.env,
} = {}) {
  const workspaceRoot = normalizeRoot(root);
  const allow = new Set(allowedCommands);

  function resolveCwd(cwd = ".") {
    const target = resolve(workspaceRoot, cwd);
    if (!inside(workspaceRoot, target)) {
      const error = new Error("workspace cwd escapes configured root");
      error.code = "workspace_escape_blocked";
      throw error;
    }
    return target;
  }

  async function run({ command, args = [], cwd = ".", timeoutMs = defaultTimeoutMs } = {}) {
    if (!allow.has(command)) {
      const error = new Error(`command is not allowlisted: ${command}`);
      error.code = "command_not_allowed";
      throw error;
    }
    if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string")) {
      throw new TypeError("workspace executor args must be an array of strings");
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
      throw new RangeError("timeoutMs must be an integer from 1 to 300000");
    }

    const startedAt = Date.now();
    const resolvedCwd = resolveCwd(cwd);

    return new Promise((resolveResult) => {
      execFile(command, args, {
        cwd: resolvedCwd,
        env,
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: maxBufferBytes,
        windowsHide: true,
      }, (error, stdout, stderr) => {
        if (!error) {
          resolveResult(freeze({
            status: "completed",
            command,
            args: freeze([...args]),
            cwd: resolvedCwd,
            exitCode: 0,
            signal: null,
            stdout,
            stderr,
            durationMs: Date.now() - startedAt,
          }));
          return;
        }

        const timedOut = error.killed === true || error.signal === "SIGTERM";
        resolveResult(freeze({
          status: timedOut ? "timeout" : "failed",
          command,
          args: freeze([...args]),
          cwd: resolvedCwd,
          exitCode: Number.isInteger(error.code) ? error.code : null,
          signal: error.signal ?? null,
          code: timedOut ? "provider_timeout" : "process_failed",
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          message: error.message,
          durationMs: Date.now() - startedAt,
        }));
      });
    });
  }

  return freeze({
    id: "workless.process-workspace-executor.v1",
    kind: "process_workspace",
    root: workspaceRoot,
    isolation: "cwd-bound-process-not-os-sandbox",
    allowedCommands: freeze([...allow]),
    run,
  });
}

export function createWorkspaceExecutorCapability(executor) {
  if (!executor || typeof executor.run !== "function") {
    throw new TypeError("workspace executor capability requires executor.run()");
  }

  return freeze({
    id: "workless.workspace-exec",
    platform: "workless-process",
    provides: ["python.execute", "shell.execute", "workspace.execute"],
    risk: "medium",
    mutates: true,
    cost: 1,
    latency: 1,
    async execute(input = {}) {
      const request = input.executionRequest ?? input.intent?.executionRequest ?? input.task?.executionRequest;
      if (!request) {
        const error = new Error("workspace capability requires executionRequest");
        error.code = "execution_request_missing";
        throw error;
      }
      const result = await executor.run(request);
      return freeze({
        toolId: "workless.workspace-exec",
        platforms: ["workless-process"],
        result,
      });
    },
  });
}
