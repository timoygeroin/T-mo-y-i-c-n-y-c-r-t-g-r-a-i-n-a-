import assert from "node:assert/strict";

import { compilePostEmbodimentHeadCursor, type PostEmbodimentHeadCursorInput } from "./post-embodiment-head-cursor.js";

const previousHead = "previous-pr-head-sha";
const newHead = "new-pr-head-sha";

function base(overrides: Partial<PostEmbodimentHeadCursorInput> = {}): PostEmbodimentHeadCursorInput {
  return {
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    previous_head_sha: previousHead,
    new_head_sha: newHead,
    write_surface: "github_contents_create_file",
    committed_files: ["platform/packages/route-governor/src/post-embodiment-head-cursor.ts"],
    executable_artifacts: ["compilePostEmbodimentHeadCursor"],
    routing_artifacts: ["new-head status readback cursor"],
    ...overrides,
  };
}

const missingReadback = compilePostEmbodimentHeadCursor(base());
assert.equal(missingReadback.ok, false);
assert.equal(missingReadback.action, "require_new_head_status_readback");
assert.equal(missingReadback.required_status_head_sha, newHead);
assert.deepEqual(missingReadback.blockers, [`missing status readback for new head ${newHead}`]);
assert.match(missingReadback.next_route, /new PR head/);

const staleReadback = compilePostEmbodimentHeadCursor(
  base({ status_readback_head_sha: previousHead }),
);
assert.equal(staleReadback.ok, false);
assert.equal(staleReadback.action, "require_new_head_status_readback");
assert.deepEqual(staleReadback.blockers, [
  `status readback belongs to ${previousHead}, not new head ${newHead}`,
]);

const acceptedReadback = compilePostEmbodimentHeadCursor(
  base({ status_readback_head_sha: newHead }),
);
assert.equal(acceptedReadback.ok, true);
assert.equal(acceptedReadback.action, "accept_new_head_status_readback");
assert.equal(acceptedReadback.head_sha, newHead);
assert.deepEqual(acceptedReadback.blockers, []);
assert.ok(acceptedReadback.decisive_evidence.includes(`status readback bound to ${newHead}`));

const noMove = compilePostEmbodimentHeadCursor(
  base({ previous_head_sha: previousHead, new_head_sha: previousHead }),
);
assert.equal(noMove.ok, false);
assert.equal(noMove.action, "block_no_head_move");
assert.deepEqual(noMove.blockers, [`branch head did not move from ${previousHead}`]);

const incomplete = compilePostEmbodimentHeadCursor(
  base({ committed_files: ["platform/docs/status.md"], executable_artifacts: [] }),
);
assert.equal(incomplete.ok, false);
assert.equal(incomplete.action, "block_incomplete_embodiment");
assert.ok(incomplete.blockers.includes("post-embodiment cursor has no executable platform file in committed files"));
assert.ok(incomplete.blockers.includes("post-embodiment cursor has no executable artifact evidence"));

console.log("post-embodiment head cursor proof passed");
