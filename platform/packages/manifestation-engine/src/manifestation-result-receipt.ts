export type ManifestationResultStatus =
  | "executed"
  | "blocked"
  | "pending"
  | "synthetic_success";

export type ManifestationResultAction =
  | "accept_manifestation_result"
  | "accept_manifestation_blocker"
  | "block_stale_result_head"
  | "block_unadmitted_command"
  | "block_synthetic_success"
  | "block_missing_external_result"
  | "block_missing_blocker";

export interface ManifestationResultReceiptInput {
  command_id: string;
  admitted_command_ids: string[];
  branch: string;
  command_head_sha: string;
  result_head_sha: string;
  status: ManifestationResultStatus;
  external_result_artifacts: string[];
  blocker?: string;
}

export interface ManifestationResultReceiptVerdict {
  ok: boolean;
  action: ManifestationResultAction;
  command_id: string | null;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function clean(value: string): string {
  return value.trim();
}

function base(input: ManifestationResultReceiptInput): Pick<
  ManifestationResultReceiptVerdict,
  "command_id" | "branch" | "head_sha"
> {
  return {
    command_id: clean(input.command_id) || null,
    branch: input.branch,
    head_sha: input.result_head_sha,
  };
}

function evidence(input: ManifestationResultReceiptInput): string[] {
  return [
    `command ${clean(input.command_id) || "<missing>"}`,
    `branch ${input.branch}`,
    `command head ${input.command_head_sha}`,
    `result head ${input.result_head_sha}`,
    ...input.external_result_artifacts,
  ];
}

function block(
  input: ManifestationResultReceiptInput,
  action: Exclude<ManifestationResultAction, "accept_manifestation_result" | "accept_manifestation_blocker">,
  blockers: string[],
  nextRoute: string,
): ManifestationResultReceiptVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence(input),
    blockers,
    next_route: nextRoute,
  };
}

export function acceptManifestationResultReceipt(
  input: ManifestationResultReceiptInput,
): ManifestationResultReceiptVerdict {
  const commandId = clean(input.command_id);

  if (!commandId || !input.admitted_command_ids.includes(commandId)) {
    return block(
      input,
      "block_unadmitted_command",
      [commandId ? `manifestation command was not admitted: ${commandId}` : "manifestation result has no command id"],
      "admit the manifestation command before accepting a result receipt",
    );
  }

  if (input.result_head_sha !== input.command_head_sha) {
    return block(
      input,
      "block_stale_result_head",
      [`result head ${input.result_head_sha} does not match command head ${input.command_head_sha}`],
      "rebuild result authority from the live head that received the command",
    );
  }

  if (input.status === "synthetic_success") {
    return block(
      input,
      "block_synthetic_success",
      ["synthetic success cannot satisfy a manifestation result receipt"],
      "attach an externally retrievable execution result or emit an exact blocker",
    );
  }

  if (input.status === "blocked") {
    const blocker = clean(input.blocker ?? "");
    if (!blocker) {
      return block(
        input,
        "block_missing_blocker",
        ["blocked manifestation result has no exact blocker"],
        "name the external blocker that stopped the admitted manifestation command",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "accept_manifestation_blocker",
      decisive_evidence: [...evidence(input), blocker],
      blockers: [blocker],
      next_route: "remove the accepted external blocker before replaying this manifestation command",
    };
  }

  if (input.external_result_artifacts.length === 0) {
    return block(
      input,
      "block_missing_external_result",
      ["manifestation result has no external artifact evidence"],
      "attach the PR review, merge, release, status, or externally visible result artifact",
    );
  }

  if (input.status !== "executed") {
    return block(
      input,
      "block_missing_external_result",
      [`manifestation result status is ${input.status}`],
      "wait for execution or emit the exact external blocker",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_manifestation_result",
    decisive_evidence: evidence(input),
    blockers: [],
    next_route: "consume this result once, then advance only through a new live-head readback or the next admitted manifestation command",
  };
}
