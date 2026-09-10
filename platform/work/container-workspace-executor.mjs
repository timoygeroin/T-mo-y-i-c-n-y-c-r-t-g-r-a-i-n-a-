import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve, sep } from "node:path";

function freeze(value) {
  return Object.freeze(value);
}

function inside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function uidGid() {
  if (typeof process.getuid !== "function" || typeof process.getgid !== "function") return null;
  return `${process.getuid()}:${process.getgid()}`;
}

export function createContainerWorkspaceExecutor({
  root,
  dockerCommand = "docker",
  profiles = {
    python: { image: "python:3.12-slim", commands: ["python3"] },
    node: { image: "node:22-bookworm-slim", commands: ["node"] },
  },
  defaultTimeoutMs = 60_000,
  maxBufferBytes = 4 * 1024 * 1024,
  memory = "512m",
  cpus = "1.0",
  pidsLimit = 128,
} = {}) {
  if (!root) throw new TypeError("container workspace executor requires root");
  const workspaceRoot = resolve(root);
  const normalizedProfiles = new Map(Object.entries(profiles).map(([id, profile]) => {
    if (!profile?.image || !Array.isArray(profile.commands) || profile.commands.length === 0) {
      throw new TypeError(`container profile ${id} requires image and commands[]`);
    }
    return [id, freeze({ image: profile.image, commands: freeze([...profile.commands]) })];
  }));

  function resolveCwd(cwd = ".") {
    const target = resolve(workspaceRoot, cwd);
    if (!inside(workspaceRoot, target)) {
      const error = new Error("container workspace cwd escapes configured root");
      error.code = "workspace_escape_blocked";
      throw error;
    }
    const relative = target.slice(workspaceRoot.length).replace(/^[/\\]+/, "");
    return relative ? `/workspace/${relative.replaceAll("\\", "/")}` : "/workspace";
  }

  function removeContainer(name) {
    return new Promise((resolveCleanup) => {
      execFile(dockerCommand, ["rm", "-f", name], {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
      }, () => resolveCleanup());
    });
  }

  function runExec(args, timeoutMs, containerName) {
    const startedAt = Date.now();
    return new Promise((resolveResult) => {
      execFile(dockerCommand, args, {
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: maxBufferBytes,
        windowsHide: true,
      }, async (error, stdout, stderr) => {
        if (!error) {
          resolveResult(freeze({
            status: "completed",
            exitCode: 0,
            signal: null,
            stdout,
            stderr,
            durationMs: Date.now() - startedAt,
          }));
          return;
        }
        const timedOut = error.killed === true || error.signal === "SIGTERM";
        if (timedOut) await removeContainer(containerName);
        resolveResult(freeze({
          status: timedOut ? "timeout" : "failed",
          code: timedOut ? "provider_timeout" : "container_process_failed",
          exitCode: Number.isInteger(error.code) ? error.code : null,
          signal: error.signal ?? null,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          message: error.message,
          durationMs: Date.now() - startedAt,
        }));
      });
    });
  }

  async function run({ profile, command, args = [], cwd = ".", timeoutMs = defaultTimeoutMs } = {}) {
    const selected = normalizedProfiles.get(profile);
    if (!selected) {
      const error = new Error(`container profile is not allowlisted: ${profile}`);
      error.code = "container_profile_not_allowed";
      throw error;
    }
    if (!selected.commands.includes(command)) {
      const error = new Error(`command is not allowlisted for ${profile}: ${command}`);
      error.code = "command_not_allowed";
      throw error;
    }
    if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string")) {
      throw new TypeError("container executor args must be an array of strings");
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
      throw new RangeError("timeoutMs must be an integer from 1 to 300000");
    }

    const containerCwd = resolveCwd(cwd);
    const hostUser = uidGid();
    const containerName = `workup-${process.pid}-${randomUUID().slice(0, 8)}`;
    const dockerArgs = [
      "run",
      "--rm",
      "--name", containerName,
      "--network", "none",
      "--memory", memory,
      "--cpus", cpus,
      "--pids-limit", String(pidsLimit),
      "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges=true",
      "--read-only",
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
      "--mount", `type=bind,src=${workspaceRoot},dst=/workspace,rw=true`,
      "--workdir", containerCwd,
    ];
    if (hostUser) dockerArgs.push("--user", hostUser);
    dockerArgs.push(selected.image, command, ...args);

    const result = await runExec(dockerArgs, timeoutMs, containerName);
    return freeze({
      ...result,
      profile,
      image: selected.image,
      command,
      args: freeze([...args]),
      cwd: containerCwd,
      isolation: freeze({
        process: "container",
        network: "none",
        rootFilesystem: "read-only",
        workspace: "bind-rw",
        capabilities: "drop-all",
        noNewPrivileges: true,
        memory,
        cpus,
        pidsLimit,
      }),
    });
  }

  return freeze({
    id: "workless.container-workspace-executor.v1",
    kind: "container_workspace",
    root: workspaceRoot,
    isolation: "os-container",
    profiles: freeze(Object.fromEntries(normalizedProfiles)),
    run,
  });
}

export function createContainerExecutorCapability(executor) {
  if (!executor || typeof executor.run !== "function") {
    throw new TypeError("container executor capability requires executor.run()");
  }
  return freeze({
    id: "workless.container-exec",
    platform: "docker-container",
    provides: ["python.execute.isolated", "node.execute.isolated", "workspace.execute.isolated"],
    risk: "medium",
    mutates: true,
    cost: 2,
    latency: 2,
    async execute(input = {}) {
      const request = input.containerRequest ?? input.intent?.containerRequest ?? input.task?.containerRequest;
      if (!request) {
        const error = new Error("container capability requires containerRequest");
        error.code = "container_request_missing";
        throw error;
      }
      const result = await executor.run(request);
      return freeze({ toolId: "workless.container-exec", platforms: ["docker-container"], result });
    },
  });
}
