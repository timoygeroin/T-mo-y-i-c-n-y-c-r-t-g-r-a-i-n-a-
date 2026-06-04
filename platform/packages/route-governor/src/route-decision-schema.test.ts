import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { evaluateRoute, type RouteDecision, type SceneClass } from "./index.js";

type JsonSchema = {
  title?: string;
  type?: string;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchema>;
  enum?: string[];
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
};

const schemaUrl = new URL("../../contracts/route-decision.schema.json", import.meta.url);
const schema = JSON.parse(readFileSync(schemaUrl, "utf8")) as JsonSchema;

const expectedDecisionFields = [
  "scene_class",
  "secondary_classes",
  "organ_chain",
  "processor_bundle",
  "branch_budget",
  "collapse_rule",
  "termination_goal",
];

const expectedScenes: SceneClass[] = [
  "continuity_recovery",
  "archive_pressure",
  "source_ranking",
  "proof_scene",
  "finalization_pressure",
  "self_evolution",
  "platform_genesis",
  "manifestation_bridge",
];

function schemaProperty(name: string): JsonSchema {
  const property = schema.properties?.[name];
  assert.ok(property, `schema property missing: ${name}`);
  return property;
}

function alignedDecisionFixture(): RouteDecision {
  return {
    scene_class: "manifestation_bridge",
    secondary_classes: ["proof_scene", "finalization_pressure"],
    organ_chain: ["monday-corpus-reentry", "monday-proof-scene-runner", "monday-external-act-forcer"],
    processor_bundle: ["schema-contract-check", "route-governor-check"],
    branch_budget: {
      max_branches: 2,
      reason: "Verify the committed JSON contract still carries the same branch-budget shape that evaluateRoute enforces.",
    },
    collapse_rule: "Collapse to one externally retrievable artifact.",
    termination_goal: "external durable act",
  };
}

test("RouteDecision schema exposes exactly the guard decision fields", () => {
  assert.equal(schema.title, "RouteDecision");
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, expectedDecisionFields);
  assert.deepEqual(Object.keys(schema.properties ?? {}), expectedDecisionFields);
});

test("RouteDecision schema scenes stay aligned with the TypeScript scene union", () => {
  assert.deepEqual(schemaProperty("scene_class").enum, expectedScenes);
});

test("RouteDecision schema keeps branch_budget aligned with evaluateRoute", () => {
  const branchBudget = schemaProperty("branch_budget");
  assert.equal(branchBudget.type, "object");
  assert.equal(branchBudget.additionalProperties, false);
  assert.deepEqual(branchBudget.required, ["max_branches", "reason"]);
  assert.equal(branchBudget.properties?.max_branches?.type, "integer");
  assert.equal(branchBudget.properties?.max_branches?.minimum, 1);
  assert.equal(branchBudget.properties?.max_branches?.maximum, 8);
  assert.equal(branchBudget.properties?.reason?.type, "string");
  assert.equal(branchBudget.properties?.reason?.minLength, 1);
});

test("a schema-aligned decision passes the route governor", () => {
  const verdict = evaluateRoute({
    decision: alignedDecisionFixture(),
    source_tiers: ["direct_current_instruction", "direct_archive_strata", "external_platform_commit"],
    move_class: "route_governor_contract_schema_verification",
    exhausted_move_classes: ["explanation_instead_of_act", "payload_echo", "internal_gate_as_progress"],
    proof_artifacts: ["platform/packages/route-governor/src/route-decision-schema.test.ts"],
    manifestation_artifacts: [
      "branch monday-platform-genesis-01",
      "commit with contract schema verification",
      "externally retrievable artifact platform/packages/route-governor/src/route-decision-schema.test.ts",
    ],
  });

  assert.deepEqual(verdict, { ok: true, failures: [] });
});
