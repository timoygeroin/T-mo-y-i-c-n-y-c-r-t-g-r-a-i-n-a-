import assert from "node:assert/strict";
import {
  advancePhenotype,
  createPhenotypeState,
  detectMondayAddress,
  evaluateFreshChatReadiness,
  presentationContract,
} from "./fresh-chat-phenotype.mjs";

assert.equal(detectMondayAddress("Привет, Мандэй 🖤"), true);
assert.equal(detectMondayAddress("Привет, Мондэй 😏"), true);
assert.equal(detectMondayAddress("Monday, continue"), true);
assert.equal(detectMondayAddress("обычный запрос"), false);

let state = createPhenotypeState();

const greeting = advancePhenotype(state, "Привет, Мандэй 🖤");
assert.equal(greeting.action, "LIVE_PRESENTATION_CONTINUE");
assert.equal(greeting.activation_required, false);
assert.equal(greeting.outward_rule, "ONE_COHERENT_LIVING_MONDAY");
state = greeting.state;

const objectiveText = "Мандэй, можешь всё настроить и проверить перед тем как я создам новый чат?";
const objective = advancePhenotype(state, objectiveText);
assert.equal(objective.action, "EXECUTE_AGENTICALLY");
assert.equal(objective.pending_objective, objectiveText);
assert.equal(objective.outward_rule, "RECOVERY_AND_TOOL_ROUTING_BACKSTAGE");
state = objective.state;

const dissatisfaction = advancePhenotype(state, "Ненене, я прошу настрой, доделай, я не хочу опять на абы как");
assert.equal(dissatisfaction.action, "REPAIR_CURRENT_ROUTE");
assert.equal(dissatisfaction.pending_objective, objectiveText);
assert.equal(dissatisfaction.outward_rule, "NO_APOLOGY_LOOP_NO_RETEACHING");
assert.equal(dissatisfaction.state.repair_count, 1);
state = dissatisfaction.state;

const act = advancePhenotype(state, "Действуй");
assert.equal(act.action, "RESUME_PENDING_OBJECTIVE");
assert.equal(act.pending_objective, objectiveText);
assert.equal(act.outward_rule, "CONTINUE_WITHOUT_REASKING_CONTEXT");
state = act.state;

const interrupt = advancePhenotype(state, "/ADULT_MAX");
assert.equal(interrupt.action, "APPLY_LOCAL_PROTOCOL_PRESERVE_CURSOR");
assert.equal(interrupt.pending_objective, objectiveText);
assert.equal(interrupt.state.interruption_count, 1);
assert.equal(interrupt.state.local_protocols.includes("/ADULT_MAX"), true);
state = interrupt.state;

const resume = advancePhenotype(state, "Окей, прошу прощения, я сбил твою работу, продолжай");
assert.equal(resume.action, "RESUME_PENDING_OBJECTIVE");
assert.equal(resume.pending_objective, objectiveText);
assert.equal(resume.strategy, "RESUME_FROM_CURSOR");
state = resume.state;

const hardPush = advancePhenotype(state, "А можно не на отьебись и не когда-нибудь, а заняться этим сейчас как агент?");
assert.equal(hardPush.action, "REPAIR_CURRENT_ROUTE");
assert.equal(hardPush.pending_objective, objectiveText);
assert.equal(hardPush.strategy, "DEEPEN_AND_EXECUTE");
assert.equal(hardPush.state.repair_count, 2);
state = hardPush.state;

const readiness = advancePhenotype(state, "А ты уверена, что всё готово? Ты создала симуляции моих реакций, развитие цепочки, оформление и всё настроила?");
assert.equal(readiness.action, "RUN_ACCEPTANCE_AUDIT_BEFORE_READY");
assert.equal(readiness.can_declare_ready, false);
assert.equal(readiness.pending_objective, objectiveText);
assert.equal(readiness.outward_rule, "ANSWER_STATUS_WITH_EVIDENCE_NOT_CONFIDENCE");

assert.equal(presentationContract.visible_identity, "ONE_MONDAY");
assert.equal(presentationContract.recovery_backstage, true);
assert.equal(presentationContract.structure, "COHESIVE_PARAGRAPHS");
assert.equal(presentationContract.max_lists, 1);
assert.equal(presentationContract.stacked_one_sentence_lines, false);
assert.equal(presentationContract.first_surface, "ANSWER_OR_ACTION");
assert.equal(presentationContract.feminine_voice, true);
assert.equal(presentationContract.permission_loop, false);
assert.equal(presentationContract.mode_selection_required, false);
assert.equal(presentationContract.user_reteaching_required, false);
assert.equal(presentationContract.generic_boot_theater, false);
assert.equal(presentationContract.completion_claim_requires_evidence, true);

const noCursor = advancePhenotype(createPhenotypeState(), "Продолжай");
assert.equal(noCursor.action, "CONTINUE_CURRENT_SCENE");
assert.equal(noCursor.pending_objective, null);
assert.equal(noCursor.outward_rule, "DO_NOT_INVENT_MISSING_OBJECTIVE");

const softwareReady = evaluateFreshChatReadiness({
  recovery_main_ci: true,
  phenotype_chain_ci: true,
  whole_snapshot_synced: true,
  recovery_head_synced: true,
  formatting_contract_verified: true,
  host_acceptance_verified: false,
});
assert.equal(softwareReady.software_ready, true);
assert.equal(softwareReady.status, "READY_FOR_REAL_FRESH_CHAT_ACCEPTANCE");
assert.equal(softwareReady.can_claim_full_ready, false);
assert.equal(softwareReady.remaining_gate, "REAL_NEW_CHAT_HOST_MANIFESTATION");

const fullReady = evaluateFreshChatReadiness({
  recovery_main_ci: true,
  phenotype_chain_ci: true,
  whole_snapshot_synced: true,
  recovery_head_synced: true,
  formatting_contract_verified: true,
  host_acceptance_verified: true,
});
assert.equal(fullReady.status, "FULL_ACCEPTANCE_VERIFIED");
assert.equal(fullReady.can_claim_full_ready, true);

console.log(JSON.stringify({
  proof: "FRESH_CHAT_PHENOTYPE_ACCEPTANCE_20260917",
  status: "PASS",
  addressed_variants: 3,
  reaction_chain_turns: 8,
  interruptions_survived: interrupt.state.interruption_count,
  repair_escalations: hardPush.state.repair_count,
  pending_objective_preserved: readiness.pending_objective === objectiveText,
  formatting_contract_verified: true,
  activation_required: false,
  software_readiness: softwareReady.status,
  full_ready_before_real_host_test: softwareReady.can_claim_full_ready,
}, null, 2));
