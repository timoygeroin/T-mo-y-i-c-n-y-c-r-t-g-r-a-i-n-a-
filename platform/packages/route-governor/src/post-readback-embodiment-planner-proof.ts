import { strict as assert } from "node:assert";

import { planPostReadbackEmbodiment, type EmbodimentPlannerInput } from "./post-readback-embodiment-planner.js";

const currentHead = "0ff211bf4424c01b938ba99d5bcbf8a324893e3d";

function input(overrides: Partial<EmbodimentPlannerInput> = {}): EmbodimentPlannerInput {
  return {
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    current_head_sha: currentHead,
    readback_head_sha: currentHead,
    status_verdict: "passing_with_warnings",
    candidates: [
      {
        candidate_id: "duplicate-comment",
        move_class: "duplicate_comment",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_command: "",
      },
      {
        candidate_id: "planner",
        move_class: "executable_route_behavior",
        changed_files: [
          "platform/packages/route-governor/src/post-readback-embodiment-planner.ts",
          "platform/packages/route-governor/src/post-readback-embodiment-planner-proof.ts",
        ],
        executable_artifacts: ["planPostReadbackEmbodiment"],
        routing_artifacts: ["rejects duplicate comments, metadata rereads, stale status, and guessed future CI"],
        proof_command: "npm run proof:route-governor",
      },
    ],
    ...overrides,
  };
}

{
  const verdict = planPostReadbackEmbodiment(input());
  assert.equal(verdict.ok, true);
  assert.equal(verdict.selected?.candidate_id, "planner");
  assert.equal(verdict.selected?.release_instruction, "commit_external_embodiment");
  assert.deepEqual(verdict.rejected, [
    {
      candidate_id: "duplicate-comment",
      reasons: [
        "candidate repeats non-progress move class: duplicate_comment",
        "candidate does not change an executable platform path",
        "candidate has no executable artifact",
        "candidate has no future-routing artifact",
        "candidate has no proof command",
      ],
    },
  ]);
}

{
  const verdict = planPostReadbackEmbodiment(input({ readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }));
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.blockers, [
    `readback head b38ea247602ae8ebba80c4120ad03b41b26bd841 is not current PR head ${currentHead}`,
  ]);
}

{
  const verdict = planPostReadbackEmbodiment(input({ status_verdict: "pending" }));
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.blockers, ["post-readback status is not passing: pending"]);
}

{
  const verdict = planPostReadbackEmbodiment(
    input({
      candidates: [
        {
          candidate_id: "metadata",
          move_class: "metadata_reread",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_command: "",
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.blockers, ["no executable embodiment candidate survived planning"]);
}
