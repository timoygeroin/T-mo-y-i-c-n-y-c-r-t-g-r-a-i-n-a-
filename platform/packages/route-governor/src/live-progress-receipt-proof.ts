import { compileLiveProgressReceipt, type LiveProgressReceiptInput } from "./live-progress-receipt.js";

const branch = "monday-platform-genesis-01";
const liveHead = "dac8dac167d2314817b7dfd7d195259b0f9b5c4c";
const resultingHead = "5f49a14c8a67d6b8eb0c20aa7e36a844a837d4b2";

function input(overrides: Partial<LiveProgressReceiptInput> = {}): LiveProgressReceiptInput {
  return {
    branch,
    active_branch: branch,
    receipt_id: "loading20-live-progress-receipt",
    move_class: "external_platform_embodiment",
    live_head_before: liveHead,
    receipt_base_head: liveHead,
    resulting_head: resultingHead,
    next_status_expected_head: resultingHead,
    changed_files: [
      "platform/packages/route-governor/src/live-progress-receipt.ts",
      "platform/packages/route-governor/src/live-progress-receipt-proof.ts",
    ],
    executable_artifacts: ["compileLiveProgressReceipt"],
    routing_artifacts: ["next status readback must bind to the resulting PR head"],
    status_surfaces: [],
    exhausted_move_classes: ["fresh_status_readback"],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runLiveProgressReceiptProof(): void {
  const accepted = compileLiveProgressReceipt(input());
  assert(accepted.ok, `moved-head executable receipt should be accepted: ${accepted.blockers.join("; ")}`);
  assert(
    accepted.action === "accept_external_progress_receipt",
    `expected accept_external_progress_receipt, got ${accepted.action}`,
  );
  assert(
    accepted.next_status_expected_head === resultingHead,
    "accepted receipt should bind the next status readback to the resulting head",
  );

  const staleBase = compileLiveProgressReceipt(input({ receipt_base_head: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }));
  assert(!staleBase.ok, "receipt based on a stale prompt-carried head must be blocked");
  assert(staleBase.action === "block_stale_receipt_head", `expected stale-head block, got ${staleBase.action}`);

  const unmoved = compileLiveProgressReceipt(input({ resulting_head: liveHead, next_status_expected_head: liveHead }));
  assert(!unmoved.ok, "external embodiment receipt must move the live head");
  assert(
    unmoved.blockers.some((blocker) => blocker.includes("did not move")),
    "unmoved receipt blocker should name missing head movement",
  );

  const unboundReadback = compileLiveProgressReceipt(input({ next_status_expected_head: liveHead }));
  assert(!unboundReadback.ok, "external embodiment receipt must bind next readback to the resulting head");
  assert(
    unboundReadback.blockers.some((blocker) => blocker.includes("next status readback")),
    "unbound readback blocker should name status binding",
  );

  const repeated = compileLiveProgressReceipt(input({ exhausted_move_classes: ["external_platform_embodiment"] }));
  assert(!repeated.ok, "exhausted move class must not be accepted as live progress");
  assert(repeated.action === "block_repeated_move_class", `expected repeated move block, got ${repeated.action}`);

  const statusReceipt = compileLiveProgressReceipt(
    input({
      move_class: "fresh_status_readback",
      resulting_head: liveHead,
      next_status_expected_head: undefined,
      status_surfaces: ["current-head Checks surface is passing"],
      exhausted_move_classes: [],
    }),
  );
  assert(statusReceipt.ok, `status receipt should be accepted: ${statusReceipt.blockers.join("; ")}`);
  assert(statusReceipt.action === "accept_status_receipt", `expected status receipt, got ${statusReceipt.action}`);

  const blockerReceipt = compileLiveProgressReceipt(
    input({
      move_class: "exact_external_blocker",
      resulting_head: liveHead,
      next_status_expected_head: undefined,
      exact_blocker: "live head is failing without an actionable log line",
      exhausted_move_classes: [],
    }),
  );
  assert(blockerReceipt.ok, `exact blocker receipt should be accepted: ${blockerReceipt.blockers.join("; ")}`);
  assert(blockerReceipt.action === "accept_blocker_receipt", `expected blocker receipt, got ${blockerReceipt.action}`);
}

runLiveProgressReceiptProof();
