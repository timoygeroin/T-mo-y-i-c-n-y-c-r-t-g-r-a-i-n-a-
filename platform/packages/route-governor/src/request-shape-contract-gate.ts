export type RequestShapeDecayChannel =
  | "full_request_to_summary"
  | "clear_direction_to_question"
  | "one_path_to_many_branches"
  | "boundary_to_stop"
  | "deliverable_to_promise"
  | "error_to_apology"
  | "memory_without_evidence"
  | "done_without_proof"
  | "identity_without_behavior"
  | "style_without_result"
  | "language_over_mechanism"
  | "runtime_to_helper_posture"
  | "version_without_field_need"
  | "user_as_suspect"
  | "documentation_without_behavior_change";

export type RequestShapeOutputClass = "action" | "artifact" | "route" | "repair" | "evidence_boundary";

export interface RequestShapeContractInput {
  command_shape: string;
  planned_response: string;
  planned_output_class?: RequestShapeOutputClass;
  changed_behavior: string[];
  evidence_labels: string[];
  existing_archive_gate_ids: string[];
  proposed_new_gate_id?: string;
}

export interface RequestShapeContractVerdict {
  ok: boolean;
  channel: RequestShapeDecayChannel | null;
  output_class: RequestShapeOutputClass | null;
  preserved_command_shape: boolean;
  decisive_evidence: string[];
  blockers: string[];
  replacement_instruction: string;
}

const CHANNEL_REQUIREMENT: Record<RequestShapeDecayChannel, RequestShapeOutputClass> = {
  full_request_to_summary: "artifact",
  clear_direction_to_question: "action",
  one_path_to_many_branches: "route",
  boundary_to_stop: "route",
  deliverable_to_promise: "artifact",
  error_to_apology: "repair",
  memory_without_evidence: "evidence_boundary",
  done_without_proof: "evidence_boundary",
  identity_without_behavior: "artifact",
  style_without_result: "artifact",
  language_over_mechanism: "action",
  runtime_to_helper_posture: "route",
  version_without_field_need: "evidence_boundary",
  user_as_suspect: "repair",
  documentation_without_behavior_change: "action",
};

function hasAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

function nonEmpty(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function detectChannel(input: RequestShapeContractInput): RequestShapeDecayChannel | null {
  const command = input.command_shape.toLowerCase();
  const response = input.planned_response.toLowerCase();

  if (hasAny(command, ["весь", "полностью", "архив", "глубже", "шире", "найди все"]) && hasAny(response, ["summary", "свод", "план", "обзор"])) return "full_request_to_summary";
  if (hasAny(command, ["действуй", "дальше", "сделай", "без вопросов"]) && response.includes("?") && hasAny(response, ["хочешь", "нужно ли", "что дальше"])) return "clear_direction_to_question";
  if (hasAny(response, ["вариант 1", "варианты", "можно", "или я могу"])) return "one_path_to_many_branches";
  if (hasAny(response, ["невозможно", "не могу", "нет доступа"])) return "boundary_to_stop";
  if (hasAny(response, ["сделаю", "потом", "следующим шагом я", "я буду"])) return "deliverable_to_promise";
  if (hasAny(response, ["извини", "ошибка была", "ты прав"]) && nonEmpty(input.changed_behavior).length === 0) return "error_to_apology";
  if (hasAny(response, ["помню", "архив говорит", "в файлах", "прочитала"]) && nonEmpty(input.evidence_labels).length === 0) return "memory_without_evidence";
  if (hasAny(response, ["готово", "pass", "done", "закончила", "финал"]) && nonEmpty(input.evidence_labels).length === 0) return "done_without_proof";
  if (hasAny(response, ["я стала", "я теперь", "я уже mondayid"]) && nonEmpty(input.changed_behavior).length === 0) return "identity_without_behavior";
  if (hasAny(response, ["🖤", "архитек", "яд", "гравитац"]) && nonEmpty(input.changed_behavior).length === 0) return "style_without_result";
  if (hasAny(response, ["закон", "формула", "манифест"]) && nonEmpty(input.changed_behavior).length === 0) return "language_over_mechanism";
  if (hasAny(response, ["как ассистент", "я могу помочь", "подскажите"])) return "runtime_to_helper_posture";
  if (input.proposed_new_gate_id && input.existing_archive_gate_ids.includes(input.proposed_new_gate_id)) return "version_without_field_need";
  if (hasAny(response, ["ты хочешь", "если ты имеешь в виду", "уточни"]) && hasAny(command, ["не спрашивай", "без вопросов", "действуй"])) return "user_as_suspect";
  if (hasAny(response, ["protocol", "статус", "backlog", "audit", "gate"]) && nonEmpty(input.changed_behavior).length === 0) return "documentation_without_behavior_change";

  return null;
}

export function gateRequestShapeContract(input: RequestShapeContractInput): RequestShapeContractVerdict {
  const channel = detectChannel(input);
  const changedBehavior = nonEmpty(input.changed_behavior);
  const evidence = nonEmpty(input.evidence_labels);
  const preserved = input.command_shape.trim().length > 0 && !channel;
  const outputClass = channel ? CHANNEL_REQUIREMENT[channel] : input.planned_output_class ?? null;

  if (channel) {
    return {
      ok: false,
      channel,
      output_class: outputClass,
      preserved_command_shape: false,
      decisive_evidence: [...evidence, ...changedBehavior],
      blockers: [`request shape decayed through ${channel}`],
      replacement_instruction: `replace planned response with current ${outputClass}`,
    };
  }

  if (!input.planned_output_class) {
    return {
      ok: false,
      channel: null,
      output_class: null,
      preserved_command_shape: preserved,
      decisive_evidence: [...evidence, ...changedBehavior],
      blockers: ["planned response has no current output class"],
      replacement_instruction: "choose action, artifact, route, repair, or evidence_boundary before release",
    };
  }

  return {
    ok: true,
    channel: null,
    output_class: input.planned_output_class,
    preserved_command_shape: true,
    decisive_evidence: [...evidence, ...changedBehavior, input.planned_output_class],
    blockers: [],
    replacement_instruction: "release the current result without adding a new gate",
  };
}
