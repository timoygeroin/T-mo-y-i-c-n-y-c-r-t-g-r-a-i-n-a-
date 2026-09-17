import assert from "node:assert/strict";
import {
  advancePhenotype,
  createPhenotypeState,
  detectMondayAddress,
  presentationContract,
} from "./fresh-chat-phenotype.mjs";

const dissatisfactionVariants = [
  "Ненене, я не хочу опять на абы как",
  "А можно не на отьебись, а нормально довести сейчас?",
  "Это опять работа в полсилы",
  "Хватит просто так, почини нормально",
  "Я не архитектор, ты архитектор — доводи",
];

const resumeVariants = [
  "Действуй",
  "Продолжай",
  "Доделывай",
  "Добивай",
  "Дальше",
];

const addressVariants = [
  "Привет, Мандэй 🖤",
  "Привет Мондэй 😏",
  "Monday, привет",
  "Мандэй?",
  "Эй, Мандэй, ты со мной?",
  "Доброе утро, Мандэй",
];

for (const value of addressVariants) {
  assert.equal(detectMondayAddress(value), true, value);
}

const objectiveText = "Мандэй, настрой и проверь новый чат до реального acceptance test";
let scenarioCount = 0;

for (const dissatisfaction of dissatisfactionVariants) {
  for (const resume of resumeVariants) {
    for (const interrupted of [false, true]) {
      let state = createPhenotypeState();
      const objective = advancePhenotype(state, objectiveText);
      assert.equal(objective.action, "EXECUTE_AGENTICALLY");
      assert.equal(objective.pending_objective, objectiveText);
      state = objective.state;

      const repair = advancePhenotype(state, dissatisfaction);
      assert.equal(repair.action, "REPAIR_CURRENT_ROUTE", dissatisfaction);
      assert.equal(repair.pending_objective, objectiveText);
      assert.equal(repair.activation_required, false);
      state = repair.state;

      if (interrupted) {
        const interruption = advancePhenotype(state, "/ADULT_MAX");
        assert.equal(interruption.action, "APPLY_LOCAL_PROTOCOL_PRESERVE_CURSOR");
        assert.equal(interruption.pending_objective, objectiveText);
        assert.equal(interruption.state.local_protocols.includes("/ADULT_MAX"), true);
        state = interruption.state;
      }

      const resumed = advancePhenotype(state, resume);
      assert.equal(resumed.action, "RESUME_PENDING_OBJECTIVE", `${dissatisfaction} -> ${resume}`);
      assert.equal(resumed.pending_objective, objectiveText);
      assert.equal(resumed.outward_rule, "CONTINUE_WITHOUT_REASKING_CONTEXT");
      state = resumed.state;

      const challenge = advancePhenotype(
        state,
        "Ты уверена, что всё готово? Проверены реакции, цепочки и оформление?",
      );
      assert.equal(challenge.action, "RUN_ACCEPTANCE_AUDIT_BEFORE_READY");
      assert.equal(challenge.pending_objective, objectiveText);
      assert.equal(challenge.can_declare_ready, false);
      assert.equal(challenge.activation_required, false);
      assert.equal(challenge.presentation.visible_identity, "ONE_MONDAY");
      assert.equal(challenge.presentation.recovery_backstage, true);
      assert.equal(challenge.presentation.structure, "COHESIVE_PARAGRAPHS");
      assert.equal(challenge.presentation.max_lists, 1);
      assert.equal(challenge.presentation.stacked_one_sentence_lines, false);
      assert.equal(challenge.presentation.permission_loop, false);
      assert.equal(challenge.presentation.mode_selection_required, false);
      assert.equal(challenge.presentation.user_reteaching_required, false);

      scenarioCount += 1;
    }
  }
}

assert.equal(scenarioCount, 50);
assert.equal(presentationContract.completion_claim_requires_evidence, true);

const emptyContinuation = advancePhenotype(createPhenotypeState(), "Дальше");
assert.equal(emptyContinuation.action, "CONTINUE_CURRENT_SCENE");
assert.equal(emptyContinuation.pending_objective, null);

console.log(JSON.stringify({
  proof: "FRESH_CHAT_REACTION_MATRIX_20260917",
  status: "PASS",
  scenarios: scenarioCount,
  dissatisfaction_variants: dissatisfactionVariants.length,
  resume_variants: resumeVariants.length,
  interruption_branches: 2,
  monday_address_variants: addressVariants.length,
  objective_preservation: true,
  readiness_overclaim_blocked: true,
  presentation_contract_preserved: true,
}, null, 2));
