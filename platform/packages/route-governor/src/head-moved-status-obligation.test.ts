import { routeHeadMovedStatusObligation, type HeadMovedStatusObligationInput } from "./head-moved-status-obligation.js";

const branch = "monday-platform-genesis-01";
const repaired = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const live = "b147a6b9dd9c0d754e94c6730fa21fe4da393ad5";

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function input(overrides: Partial<HeadMovedStatusObligationInput> = {}): HeadMovedStatusObligationInput {
  return {
    active_branch: branch,
    prompt_head_sha: repaired,
    live_head_sha: live,
    last_status_readback_head_sha: "3bf8e07dce32e59accf776357fb22278f57ba3f5",
    repaired_historical_heads: [repaired],
    release_class: "metadata_reread",
    observations: [
      {
        surface_id: "connector-pr-metadata",
        kind: "live_pr_metadata",
        branch,
        head_sha: live,
        status_verdict: "unknown",
        evidence: [`PR #2 live head ${live}`],
      },
    ],
    ...overrides,
  };
}

const metadataOnly = routeHeadMovedStatusObligation(input());
expect(!metadataOnly.ok, "metadata reread must not satisfy moved-head obligation");
expect(metadataOnly.action === "block_metadata_as_progress", "metadata must be blocked as progress");

const opened = routeHeadMovedStatusObligation(input({ release_class: "fresh_status_readback" }));
expect(opened.ok, "moved head without direct status may open the obligation");
expect(opened.action === "open_moved_head_status_obligation", "moved head should open obligation");
expect(opened.status_obligation_head_sha === live, "obligation must bind to live head");

const directStatus = routeHeadMovedStatusObligation(
  input({
    release_class: "fresh_status_readback",
    observations: [
      {
        surface_id: "checks-live-success",
        kind: "direct_status_surface",
        branch,
        head_sha: live,
        status_verdict: "warning_only",
        evidence: ["Route Governor Proof succeeded", "Node.js 20 notice warning only"],
      },
    ],
  }),
);
expect(directStatus.ok, "direct live-head status should satisfy obligation");
expect(directStatus.action === "admit_direct_live_head_status", "direct status should be admitted");

const staleStatus = routeHeadMovedStatusObligation(
  input({
    release_class: "fresh_status_readback",
    observations: [
      {
        surface_id: "checks-repaired-head",
        kind: "direct_status_surface",
        branch,
        head_sha: repaired,
        status_verdict: "success",
        evidence: ["old repaired-head checks succeeded"],
      },
    ],
  }),
);
expect(!staleStatus.ok, "stale status must not satisfy live-head obligation");
expect(staleStatus.action === "block_stale_status_surface", "stale status must be blocked");

const embodiment = routeHeadMovedStatusObligation(
  input({
    release_class: "external_platform_embodiment",
    embodiment_candidate: {
      branch,
      base_head_sha: live,
      changed_files: ["platform/packages/route-governor/src/head-moved-status-obligation.ts"],
      behavior_artifacts: ["routeHeadMovedStatusObligation"],
      routing_artifacts: ["moved-head status obligation"],
      proof_artifacts: ["platform/packages/route-governor/src/head-moved-status-obligation.test.ts"],
      opens_post_write_status_escrow: true,
      expected_result_head_sha: "next-head",
    },
  }),
);
expect(embodiment.ok, "obligated embodiment should be admitted");
expect(embodiment.action === "admit_obligated_external_embodiment", "embodiment should be admitted under obligation");

const repairedBlocker = routeHeadMovedStatusObligation(input({ release_class: "repaired_head_blocker" }));
expect(!repairedBlocker.ok, "repaired-head blocker replay must be blocked");
expect(repairedBlocker.action === "block_repaired_head_reuse", "repaired-head blocker must be historical only");
