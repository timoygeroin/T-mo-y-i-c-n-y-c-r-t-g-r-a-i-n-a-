import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createProcessWorkspaceExecutor } from "./process-workspace-executor.mjs";

const directory = await mkdtemp(join(tmpdir(), "mondayid-workspace-exec-"));

try {
  const executor = createProcessWorkspaceExecutor({
    root: directory,
    allowedCommands: ["python3", "bash"],
  });

  const python = await executor.run({
    command: "python3",
    args: ["-c", "import json; print(json.dumps({'engine':'python','value':6*7}))"],
  });
  assert.equal(python.status, "completed");
  assert.deepEqual(JSON.parse(python.stdout.trim()), { engine: "python", value: 42 });

  const shell = await executor.run({
    command: "bash",
    args: ["-lc", "printf shell-ok"],
  });
  assert.equal(shell.status, "completed");
  assert.equal(shell.stdout, "shell-ok");

  const write = await executor.run({
    command: "python3",
    args: ["-c", "from pathlib import Path; Path('artifact.txt').write_text('workup-artifact', encoding='utf-8')"],
  });
  assert.equal(write.status, "completed");
  assert.equal(await readFile(join(directory, "artifact.txt"), "utf8"), "workup-artifact");

  await assert.rejects(
    executor.run({ command: "python3", cwd: "../", args: ["-c", "print('escape')"] }),
    (error) => error.code === "workspace_escape_blocked",
  );

  await assert.rejects(
    executor.run({ command: "curl", args: ["https://example.com"] }),
    (error) => error.code === "command_not_allowed",
  );

  const timeout = await executor.run({
    command: "python3",
    args: ["-c", "import time; time.sleep(2)"],
    timeoutMs: 50,
  });
  assert.equal(timeout.status, "timeout");
  assert.equal(timeout.code, "provider_timeout");

  assert.equal(executor.isolation, "cwd-bound-process-not-os-sandbox");
  console.log("WORKLESS_PROCESS_EXECUTOR_PROOF_PASS 6/6");
} finally {
  await rm(directory, { recursive: true, force: true });
}
