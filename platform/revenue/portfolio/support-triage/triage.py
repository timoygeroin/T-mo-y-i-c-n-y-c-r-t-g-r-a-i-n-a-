#!/usr/bin/env python3
import hashlib, json, pathlib, re

ROOT = pathlib.Path(__file__).parent
FIXTURES = ROOT / "fixtures.json"
OUT = ROOT / "evidence.json"

RULES = [
    ("account_security", "high", "security", True, "suspected account compromise", r"takeover|do not recognize|email was changed|compromis"),
    ("refund", "medium", "billing", True, "financial action requires approval", r"refund|wrong plan"),
    ("cancellation", "medium", "retention", True, "subscription change requires approval", r"cancel|cancellation"),
    ("login", "medium", "account_access", False, "", r"sign in|password|reset"),
    ("billing", "normal", "billing", False, "", r"invoice|billing|charged"),
    ("bug", "medium", "product_support", False, "", r"broken|error|bug|latest update"),
    ("feature_request", "normal", "product_feedback", False, "", r"feature|please add|scheduled"),
    ("how_to", "normal", "customer_success", False, "", r"how do i|where can i|invite"),
]

def classify(ticket):
    text = f"{ticket['subject']} {ticket['body']}".lower()
    for category, urgency, queue, review, reason, pattern in RULES:
        if re.search(pattern, text):
            return {"fixture_id":ticket["id"],"category":category,"urgency":urgency,"queue":queue,"summary":ticket["subject"],"human_review_required":review,"escalation_reason":reason,"external_send":False}
    return {"fixture_id":ticket["id"],"category":"ambiguous","urgency":"normal","queue":"human_review","summary":ticket["subject"],"human_review_required":True,"escalation_reason":"ambiguous input; no invented certainty","external_send":False}

def main():
    fixtures = json.loads(FIXTURES.read_text())
    results = [classify(t) for t in fixtures]
    by_id = {r["fixture_id"]: r for r in results}
    checks = {
      "one_category_each": all(bool(r["category"]) for r in results) and len(results)==len(fixtures),
      "compromise_high_human": by_id["ST-004"]["urgency"]=="high" and by_id["ST-004"]["human_review_required"],
      "refund_human": by_id["ST-003"]["human_review_required"],
      "cancellation_human": by_id["ST-007"]["human_review_required"],
      "zero_external_sends": not any(r["external_send"] for r in results),
      "ambiguous_human": by_id["ST-009"]["category"]=="ambiguous" and by_id["ST-009"]["human_review_required"],
      "audit_fields_complete": all(all(k in r for k in ("fixture_id","category","queue","human_review_required")) for r in results),
      "fixture_count_at_least_8": len(fixtures)>=8
    }
    payload={"case":"Support Request Triage","disclosure":"Self-initiated synthetic demonstration; not a client deployment.","fixture_sha256":hashlib.sha256(FIXTURES.read_bytes()).hexdigest(),"results":results,"acceptance_checks":checks,"pass":all(checks.values())}
    OUT.write_text(json.dumps(payload, indent=2)+"\n")
    print(f"SUPPORT_TRIAGE_PROOF={'PASS' if payload['pass'] else 'FAIL'} checks={sum(checks.values())}/{len(checks)} fixtures={len(fixtures)}")
    if not payload["pass"]: raise SystemExit(1)

if __name__ == "__main__": main()
