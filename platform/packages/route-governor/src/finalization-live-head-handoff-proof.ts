import { compileLiveHeadFinalizationHandoff, type LiveHeadFinalizationHandoffInput } from "./finalization-live-head-handoff.js";

function input(overrides: Partial<LiveHeadFinalizationHandoffInput> = {}): LiveHeadFinalizationHandoffInput {
  return {
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    prompt_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    live_head_sha: "9a12f009ce355d2819886fe05c146e9f422e50cc",
    resolved_repaired_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    resolved_repaired_head_status_readback: true,
    move_class: "external_platform_embodiment",
    changed_files: ["platform/packages/route-governor/src/finalization-live-head-handoff.ts"],
    executable_artifacts: ["compileLiveHeadFinalizationHandoff"],
    routing_artifacts: ["live-head finalization handoff guard"],
    status_surface_ids: [],
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
    throw new Error(`${name} blocked for the wrong reason: ${blockers.join("; ")}`);
  }
}

const embodiment = compileLiveHeadFinalizationHandoff(input());
expectOk("external embodiment handoff", embodiment.ok, embodiment.blockers);
if (embodiment.action !== "continue_from_live_head") {
  throw new Error(`external embodiment chose ${embodiment.action} instead of continue_from_live_head`);
}
if (!embodiment.decisive_evidence.some((item) => item.includes("live head supersedes prompt head"))) {
  throw new Error("external embodiment did not preserve moved-head evidence");
}

const repairedHeadBlocker = compileLiveHeadFinalizationHandoff(input({ move_class: "repaired_head_blocker" }));
expectBlock("repaired-head blocker resurrection", repairedHeadBlocker.ok, repairedHeadBlocker.blockers, "already resolved");
if (repairedHeadBlocker.action !== "block_repaired_head_resurrection") {
  throw new Error(`repaired-head blocker chose ${repairedHeadBlocker.action}`);
}

const metadataReread = compileLiveHeadFinalizationHandoff(input({
  move_class: "metadata_reread",
  changed_files: [],
  executable_artifacts: [],
  routing_artifacts: [],
}));
expectBlock("metadata reread", metadataReread.ok, metadataReread.blockers, "non-progress");

const freshReadback = compileLiveHeadFinalizationHandoff(input({
  move_class: "fresh_status_readback",
  changed_files: [],
  executable_artifacts: [],
  routing_artifacts: [],
  status_surface_ids: ["27090000001"],
}));
expectOk("moved-head fresh readback", freshReadback.ok, freshReadback.blockers);
if (freshReadback.action !== "read_live_head_status") {
  throw new Error(`fresh readback chose ${freshReadback.action} instead of read_live_head_status`);
}

const incompleteEmbodiment = compileLiveHeadFinalizationHandoff(input({
  changed_files: ["platform/docs/status.md"],
  executable_artifacts: [],
  routing_artifacts: [],
}));
expectBlock("incomplete embodiment", incompleteEmbodiment.ok, incompleteEmbodiment.blockers, "lacks executable platform file");

const wrongBranch = compileLiveHeadFinalizationHandoff(input({ branch: "main" }));
expectBlock("wrong branch", wrongBranch.ok, wrongBranch.blockers, "does not match active branch");
