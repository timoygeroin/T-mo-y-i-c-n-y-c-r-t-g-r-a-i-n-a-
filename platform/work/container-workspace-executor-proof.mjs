import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createContainerWorkspaceExecutor } from "./container-workspace-executor.mjs";

const directory = await mkdtemp(join(tmpdir(), "workup-container-"));

try {
  const executor = createContainerWorkspaceExecutor({
    root: directory,
    profiles: {
      python: { image: "python:3.12-slim", commands: ["python3"] },
    },
  });

  const compute = await executor.run({
    profile: "python",
    command: "python3",
    args: ["-c", "import json; print(json.dumps({'engine':'container-python','value':9*9}))"],
  });
  assert.equal(compute.status, "completed");
  assert.deepEqual(JSON.parse(compute.stdout.trim()), { engine: "container-python", value: 81 });
  assert.equal(compute.isolation.network, "none");
  assert.equal(compute.isolation.rootFilesystem, "read-only");
  assert.equal(compute.isolation.capabilities, "drop-all");

  const write = await executor.run({
    profile: "python",
    command: "python3",
    args: ["-c", "from pathlib import Path; Path('container-artifact.txt').write_text('isolated-workup', encoding='utf-8')"],
  });
  assert.equal(write.status, "completed");
  assert.equal(await readFile(join(directory, "container-artifact.txt"), "utf8"), "isolated-workup");

  const network = await executor.run({
    profile: "python",
    command: "python3",
    args: [
      "-c",
      "import socket\ntry:\n socket.create_connection(('1.1.1.1', 443), timeout=1); print('NETWORK_OPEN'); raise SystemExit(7)\nexcept OSError:\n print('NETWORK_BLOCKED')",
    ],
  });
  assert.equal(network.status, "completed");
  assert.equal(network.stdout.trim(), "NETWORK_BLOCKED");

  const rootWrite = await executor.run({
    profile: "python",
    command: "python3",
    args: [
      "-c",
      "from pathlib import Path\ntry:\n Path('/root-write-test').write_text('x'); print('ROOT_WRITABLE'); raise SystemExit(8)\nexcept OSError:\n print('ROOT_READ_ONLY')",
    ],
  });
  assert.equal(rootWrite.status, "completed");
  assert.equal(rootWrite.stdout.trim(), "ROOT_READ_ONLY");

  await assert.rejects(
    executor.run({ profile: "python", command: "python3", cwd: "../", args: ["-c", "print('escape')"] }),
    (error) => error.code === "workspace_escape_blocked",
  );

  await assert.rejects(
    executor.run({ profile: "unknown", command: "python3", args: ["-c", "print('x')"] }),
    (error) => error.code === "container_profile_not_allowed",
  );

  await assert.rejects(
    executor.run({ profile: "python", command: "bash", args: ["-lc", "echo x"] }),
    (error) => error.code === "command_not_allowed",
  );

  const timeout = await executor.run({
    profile: "python",
    command: "python3",
    args: ["-c", "import time; time.sleep(4)"],
    timeoutMs: 100,
  });
  assert.equal(timeout.status, "timeout");
  assert.equal(timeout.code, "provider_timeout");

  assert.equal(executor.isolation, "os-container");
  console.log("WORKUP_CONTAINER_EXECUTOR_PROOF_PASS 14/14");
} finally {
  await rm(directory, { recursive: true, force: true });
}
