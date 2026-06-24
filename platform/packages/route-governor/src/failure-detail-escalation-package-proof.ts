import { compileFailureDetailEscalation } from "./failure-detail-escalation.js";

const verdict = compileFailureDetailEscalation({
  branch: "monday-platform-genesis-01",
  active_branch: "monday-platform-genesis-01",
  live_head_sha: "75629952307b1d774bb565a709ed9b01d05290cd",
  failing_surface: {
    surface_id: "package-export-proof",
    kind: "public_checks_summary",
    head_sha: "75629952307b1d774bb565a709ed9b01d05290cd",
    check_name: "Monday Platform CI / Route governor proof surface",
    failed_step: "Run proof examples",
    exit_code: 1,
  },
  available_transports: [
    {
      transport_id: "check-run-annotation",
      kind: "check_run_annotation",
      available: true,
      command: "read check-run annotation for current-head proof failure",
    },
  ],
  spent_escalation_signatures: [],
});

if (!verdict.ok || verdict.action !== "request_check_run_annotation") {
  throw new Error(`failure-detail escalation package proof failed: ${verdict.action}`);
}

console.log("failure-detail escalation package proof passed");
