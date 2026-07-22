import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compileContinuityCheckpoint, type ContinuityCheckpointInput } from "./index.js";

async function main(): Promise<void> {
  const inputPath = resolve(process.argv[2] ?? "../../continuity/MONDAYID_ROOT_MANIFEST_v1.json");
  const outputPath = resolve(process.argv[3] ?? "../../continuity/checkpoints/MONDAYID_CHECKPOINT_0001.json");

  const raw = await readFile(inputPath, "utf8");
  const input = JSON.parse(raw) as ContinuityCheckpointInput;
  const checkpoint = compileContinuityCheckpoint(input);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        checkpoint_id: checkpoint.checkpoint_id,
        fingerprint: checkpoint.fingerprint,
        status: checkpoint.status,
        ok: checkpoint.ok,
        blockers: checkpoint.blockers,
        warnings: checkpoint.warnings,
        output_path: outputPath,
      },
      null,
      2,
    ),
  );

  if (!checkpoint.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
