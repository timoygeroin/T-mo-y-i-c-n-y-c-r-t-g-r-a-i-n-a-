import {
  admitScheduledHeadMove,
  type ScheduledHeadMoveAdmissionInput,
} from "./scheduled-head-move-admission.js";

const activeBranch = "monday-platform-genesis-01";
const promptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "e794f250fad97a8d25fd158bc16ac01e6dc7b44a";

function baseInput(overrides: Partial<ScheduledHeadMoveAdmissionInput> = {}): ScheduledHeadMoveAdmissionInput {
  return {
    active_branch: activeBranch,
    prompt_head_sha: promptHead,
    live_head_sha: liveHead,
    last_status_readback_head_sha: "3bf8e07dce32e59accf776357fb22278f57ba3f5",
    candidate: {
      move_class: "external_platform_embodiment",
      branch: activeBranch,
      base_head_sha: liveHead,
      changed_files: [
        "platform/packages/route-governor/src/scheduled-head-move-admission.ts",
        "platform/packages/route-governor/src/scheduled-head-move-admission-proof.ts",
      ],
      executable_artifacts: ["admitScheduledHeadMove"],
      routing_artifacts: ["scheduled moved-head status readback admission"],
      proof_artifacts: ["scheduled-head-move-admission-proof"],
    },
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) {
    throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
  }
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) {
    throw new Error(`${name} should block, but passed`);
  }
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runScheduledHeadMoveAdmissionProof(): void {
  const movedHead = admitScheduledHeadMove(baseInput());
  expectOk("moved head routes to readback", movedHead.ok, movedHead.blockers);
  if (movedHead.action !== "admit_moved_head_status_readback") {
    throw new Error(`expected moved-head readback admission, got ${movedHead.action}`);
  }
  if (movedHead.quarantined_prompt_head !== promptHead) {
    throw new Error("expected prompt head to be quarantined under the live head");
  }
  if (movedHead.expired_status_head_sha !== "3bf8e07dce32e59accf776357fb22278f57ba3f5") {
    throw new Error("expected previous status head to expire under the live head");
  }

  const passingStatus = admitScheduledHeadMove(
    baseInput({
      prompt_head_sha: liveHead,
      last_status_readback_head_sha: liveHead,
      status_surface: {
        surface_id: "checks:e794f250",
        head_sha: liveHead,
        verdict: "passing_with_warnings",
        decisive_successes: ["Route Governor Proof succeeded", "Monday Platform CI succeeded"],
        blocking_failures: [],
        pending_surfaces: [],
        non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
      },
    }),
  );
  expectOk("passing current-head status admits embodiment", passingStatus.ok, passingStatus.blockers);
  if (passingStatus.action !== "admit_current_head_embodiment") {
    throw new Error(`expected embodiment admission, got ${passingStatus.action}`);
  }

  const staleStatus = admitScheduledHeadMove(
    baseInput({
      status_surface: {
        surface_id: "checks:old-head",
        head_sha: promptHead,
        verdict: "passing",
        decisive_successes: ["old head succeeded"],
        blocking_failures: [],
        pending_surfaces: [],
        non_blocking_warnings: [],
      },
    }),
  );
  expectBlock("stale status surface", staleStatus.ok, staleStatus.blockers, "not live head");

  const failingStatus = admitScheduledHeadMove(
    baseInput({
      prompt_head_sha: liveHead,
      last_status_readback_head_sha: liveHead,
      status_surface: {
        surface_id: "checks:failing-live-head",
        head_sha: liveHead,
        verdict: "failing",
        decisive_successes: [],
        blocking_failures: ["Route governor proof examples failed"],
        pending_surfaces: [],
        non_blocking_warnings: [],
      },
    }),
  );
  expectBlock("failing live status", failingStatus.ok, failingStatus.blockers, "failed");

  const staleCandidate = admitScheduledHeadMove(
    baseInput({ candidate: { ...baseInput().candidate, base_head_sha: promptHead } }),
  );
  expectBlock("stale candidate base", staleCandidate.ok, staleCandidate.blockers, "not live head");

  const exactBlocker = admitScheduledHeadMove(
    baseInput({
      candidate: {
        ...baseInput().candidate,
        move_class: "exact_external_blocker",
        blocker: "external reviewer permission boundary is unavailable for PR #2",
      },
    }),
  );
  expectOk("exact blocker survives", exactBlocker.ok, exactBlocker.blockers);
  if (exactBlocker.action !== "emit_exact_external_blocker") {
    throw new Error(`expected exact blocker emission, got ${exactBlocker.action}`);
  }
}

runScheduledHeadMoveAdmissionProof();
