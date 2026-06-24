import { acceptManifestationResultReceipt } from "./manifestation-result-receipt.js";

export function runManifestationResultReceiptProof(): void {
  const commandHead = "efba80a5165b6beb50802007bc31cf76036232bc";

  const accepted = acceptManifestationResultReceipt({
    command_id: "manifestation-efba-review-result",
    admitted_command_ids: ["manifestation-efba-review-result"],
    branch: "monday-platform-genesis-01",
    command_head_sha: commandHead,
    result_head_sha: commandHead,
    status: "executed",
    external_result_artifacts: ["PR #2 review command result", `head ${commandHead}`],
  });
  if (!accepted.ok || accepted.action !== "accept_manifestation_result") {
    throw new Error(`manifestation result receipt proof failed: ${accepted.blockers.join("; ")}`);
  }

  const staleHead = acceptManifestationResultReceipt({
    command_id: "manifestation-efba-review-result",
    admitted_command_ids: ["manifestation-efba-review-result"],
    branch: "monday-platform-genesis-01",
    command_head_sha: commandHead,
    result_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    status: "executed",
    external_result_artifacts: ["PR #2 review command result"],
  });
  if (staleHead.ok || staleHead.action !== "block_stale_result_head") {
    throw new Error("manifestation result receipt accepted a stale result head");
  }

  const unadmitted = acceptManifestationResultReceipt({
    command_id: "manifestation-unadmitted",
    admitted_command_ids: ["manifestation-efba-review-result"],
    branch: "monday-platform-genesis-01",
    command_head_sha: commandHead,
    result_head_sha: commandHead,
    status: "executed",
    external_result_artifacts: ["PR #2 review command result"],
  });
  if (unadmitted.ok || unadmitted.action !== "block_unadmitted_command") {
    throw new Error("manifestation result receipt accepted an unadmitted command");
  }

  const synthetic = acceptManifestationResultReceipt({
    command_id: "manifestation-efba-review-result",
    admitted_command_ids: ["manifestation-efba-review-result"],
    branch: "monday-platform-genesis-01",
    command_head_sha: commandHead,
    result_head_sha: commandHead,
    status: "synthetic_success",
    external_result_artifacts: ["local note only"],
  });
  if (synthetic.ok || synthetic.action !== "block_synthetic_success") {
    throw new Error("manifestation result receipt accepted synthetic success");
  }

  const blocked = acceptManifestationResultReceipt({
    command_id: "manifestation-efba-review-result",
    admitted_command_ids: ["manifestation-efba-review-result"],
    branch: "monday-platform-genesis-01",
    command_head_sha: commandHead,
    result_head_sha: commandHead,
    status: "blocked",
    external_result_artifacts: ["PR #2 review queue"],
    blocker: "external review surface returned no executable review action",
  });
  if (!blocked.ok || blocked.action !== "accept_manifestation_blocker") {
    throw new Error(`manifestation blocker receipt proof failed: ${blocked.blockers.join("; ")}`);
  }
}

runManifestationResultReceiptProof();
