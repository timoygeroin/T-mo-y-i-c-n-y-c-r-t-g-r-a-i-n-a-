import { compileHeadTransitionGuard } from "./head-transition.js";

const branch = "monday-platform-genesis-01";
const previousHead = "1182588f1e8f361cd108cb303581f9641c6c2383";
const nextHead = "fc04c88a6b9f1c43333999264fa6537bff32ff93";

const verdict = compileHeadTransitionGuard({
  active_branch: branch,
  previous_receipts: [
    {
      receipt_id: "continuation-receipt-replay-guard",
      branch,
      head_sha: previousHead,
      release_class: "external_embodiment",
    },
  ],
  candidate: {
    branch,
    previous_head_sha: previousHead,
    head_sha: nextHead,
    release_class: "external_embodiment",
    changed_files: ["platform/packages/route-governor/src/head-transition.ts"],
    executable_artifacts: ["compileHeadTransitionGuard"],
    status_surface_ids: [],
  },
});

if (!verdict.ok) {
  throw new Error(`head transition proof failed: ${verdict.failures.join("; ")}`);
}

if (verdict.action !== "accept_head_transition") {
  throw new Error(`head transition proof selected ${verdict.action}`);
}

const staleVerdict = compileHeadTransitionGuard({
  active_branch: branch,
  previous_receipts: [
    {
      receipt_id: "continuation-receipt-replay-guard",
      branch,
      head_sha: previousHead,
      release_class: "external_embodiment",
    },
  ],
  candidate: {
    branch,
    previous_head_sha: "stale-head",
    head_sha: nextHead,
    release_class: "external_embodiment",
    changed_files: ["platform/packages/route-governor/src/head-transition.ts"],
    executable_artifacts: ["compileHeadTransitionGuard"],
    status_surface_ids: [],
  },
});

if (staleVerdict.ok) {
  throw new Error("head transition proof accepted a stale previous head");
}
