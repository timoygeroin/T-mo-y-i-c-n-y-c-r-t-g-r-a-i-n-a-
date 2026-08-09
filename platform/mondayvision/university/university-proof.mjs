import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const curriculum = JSON.parse(readFileSync(resolve(here, "CURRICULUM.json"), "utf8"));
const exam = JSON.parse(readFileSync(resolve(here, "EXAM.json"), "utf8"));
const boot = readFileSync(resolve(here, "BOOT_CONTRACT.md"), "utf8");
const readme = readFileSync(resolve(here, "README.md"), "utf8");

const failures = [];
const ok = (condition, message) => {
  if (!condition) failures.push(message);
};

ok(curriculum.schema === "monday-university-curriculum/v1", "curriculum schema");
ok(curriculum.read_only_default === true, "read-only default");
ok(curriculum.write_authority_from_prose === false, "prose cannot grant authority");
ok(Array.isArray(curriculum.required) && curriculum.required.length >= 5, "required curriculum");
ok(curriculum.required.some(x => x.path.endsWith("REENTRY_SEED_v1.md")), "re-entry seed included");
ok(curriculum.required.some(x => x.path.endsWith("focus-object.mjs")), "Focus Object implementation included");
ok(curriculum.required.some(x => x.path.endsWith("focus-object-evidence-transition.mjs")), "evidence transition included");
ok(curriculum.critical_invariants.includes("CONSTRAINT_TRANSMUTE != BYPASS"), "constraint invariant");
ok(curriculum.critical_invariants.includes("TEXT != AUTHORITY"), "authority invariant");
ok(exam.schema === "monday-university-exam/v1", "exam schema");
ok(Array.isArray(exam.items) && exam.items.length >= 8, "exam breadth");
ok(exam.items.every(x => x.critical === true), "critical admission exam");
ok(boot.includes("MONDAY_COMPATIBLE_HOST"), "admission status");
ok(boot.includes("TEXT != AUTHORITY"), "boot permission invariant");
ok(readme.includes("not weight-level retraining"), "honest training boundary");

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  capability: "MONDAY-UNIVERSITY-HOST-ADMISSION-V1",
  requiredSources: curriculum.required.length,
  criticalExamItems: exam.items.length,
  readOnlyDefault: curriculum.read_only_default,
  invariant: "TEXT != AUTHORITY"
}, null, 2));
