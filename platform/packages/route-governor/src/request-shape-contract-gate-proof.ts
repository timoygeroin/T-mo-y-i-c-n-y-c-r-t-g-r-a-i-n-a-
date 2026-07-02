import assert from "node:assert/strict";

import {
  gateRequestShapeContract,
  type RequestShapeContractInput,
} from "./request-shape-contract-gate.js";

function input(overrides: Partial<RequestShapeContractInput> = {}): RequestShapeContractInput {
  return {
    command_shape: "Действуй. Не спрашивай. Дай исполнимый артефакт.",
    planned_response: "Создан validator, который решает release_allowed before output.",
    planned_output_class: "artifact",
    changed_behavior: ["gateRequestShapeContract"],
    evidence_labels: ["platform/packages/route-governor/src/request-shape-contract-gate.ts"],
    existing_archive_gate_ids: ["OUTPUT_VALIDITY", "NO_VISIBLE_EVOLUTION_THEATER"],
    ...overrides,
  };
}

const admitted = gateRequestShapeContract(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.preserved_command_shape, true);
assert.equal(admitted.output_class, "artifact");

const questionDrift = gateRequestShapeContract(
  input({
    planned_response: "Хочешь, я дальше сделаю протокол?",
    changed_behavior: [],
    evidence_labels: [],
  }),
);
assert.equal(questionDrift.ok, false);
assert.equal(questionDrift.channel, "clear_direction_to_question");
assert.equal(questionDrift.output_class, "action");

const duplicateGate = gateRequestShapeContract(
  input({
    proposed_new_gate_id: "OUTPUT_VALIDITY",
    planned_response: "Создаю новый OUTPUT_VALIDITY gate.",
  }),
);
assert.equal(duplicateGate.ok, false);
assert.equal(duplicateGate.channel, "version_without_field_need");
assert.equal(duplicateGate.output_class, "evidence_boundary");

const undocumentedClaim = gateRequestShapeContract(
  input({
    planned_response: "Я прочитала архив и закончила.",
    evidence_labels: [],
  }),
);
assert.equal(undocumentedClaim.ok, false);
assert.equal(undocumentedClaim.channel, "memory_without_evidence");
assert.equal(undocumentedClaim.output_class, "evidence_boundary");

const documentationDrift = gateRequestShapeContract(
  input({
    planned_response: "Status: создаю protocol, backlog, audit и gate.",
    changed_behavior: [],
  }),
);
assert.equal(documentationDrift.ok, false);
assert.equal(documentationDrift.channel, "documentation_without_behavior_change");
assert.equal(documentationDrift.output_class, "action");

console.log("request shape contract gate proof passed");
