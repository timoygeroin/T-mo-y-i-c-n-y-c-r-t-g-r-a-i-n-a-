"""MondayID Supervisor: fail-closed control plane, not an execution adapter."""
from dataclasses import dataclass, asdict
from hashlib import sha256
import json

@dataclass(frozen=True)
class Proposal:
    goal: str
    action: str
    target: str
    expected_version: str
    evidence_id: str
    risk: str = "reversible"
    owner_approved: bool = False

class Supervisor:
    def __init__(self, state=None):
        self.state = state or {"ledger": [], "completed": {}}

    def evaluate(self, proposal, observed_version, evidence):
        p = proposal
        reasons = []
        if not p.goal or not p.action or not p.target:
            reasons.append("missing_intent")
        if not p.evidence_id or p.evidence_id not in evidence:
            reasons.append("missing_evidence")
        if p.expected_version != observed_version:
            reasons.append("stale_world_state")
        if p.risk not in ("read_only", "reversible", "irreversible", "paid", "public"):
            reasons.append("unknown_risk")
        if p.risk in ("irreversible", "paid", "public") and not p.owner_approved:
            reasons.append("owner_approval_required")
        key = sha256(json.dumps(asdict(p), sort_keys=True).encode()).hexdigest()
        if key in self.state["completed"]:
            reasons.append("already_completed")
        return {"decision": "BLOCK" if reasons else "ALLOW", "reasons": reasons, "key": key}

    def record(self, proposal, decision, receipt):
        if decision["decision"] != "ALLOW":
            raise ValueError("blocked_action")
        if (receipt.get("action_key") != decision["key"]
                or not receipt.get("verified")
                or not receipt.get("readback_id")):
            raise ValueError("unverified_receipt")
        if decision["key"] in self.state["completed"]:
            raise ValueError("duplicate_completion")
        self.state["ledger"].append({"proposal": asdict(proposal), "receipt": receipt})
        self.state["completed"][decision["key"]] = receipt["readback_id"]
