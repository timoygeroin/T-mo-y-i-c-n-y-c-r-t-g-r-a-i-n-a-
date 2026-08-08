# Support Request Triage — Portfolio Case V1

Status: SPEC_READY_FOR_EXECUTABLE_PROOF
Type: self-initiated synthetic demonstration; NOT a client case study.

## Buyer problem

Small teams often receive mixed support requests that differ in urgency, topic and risk. Manual sorting is repetitive, but fully autonomous replies create avoidable risk.

## Demonstrated solution boundary

Build a deterministic, inspectable triage workflow that accepts representative support requests and produces:
- category;
- urgency;
- recommended queue;
- concise internal summary;
- `human_review_required` flag;
- reason for escalation;
- audit receipt.

The demonstration MUST NOT send external replies, impersonate a support agent, or claim client deployment.

## Synthetic fixture set

Use at least 8 synthetic tickets covering:
1. password/login trouble;
2. billing question;
3. refund request;
4. suspected account compromise;
5. product bug;
6. feature request;
7. cancellation request;
8. general how-to question.

No real customer PII.

## Acceptance tests

1. Every fixture receives exactly one category.
2. Suspected account compromise is always high urgency and human-reviewed.
3. Refund/cancellation actions remain human-approved.
4. No fixture triggers an external send.
5. Unknown/ambiguous inputs route to human review rather than invented certainty.
6. Audit receipt records fixture ID, classification, queue and review flag.
7. Output is reproducible from the committed fixture set.
8. Portfolio copy explicitly says synthetic/self-initiated.

## Commercial mapping

This proof supports truthful offers for:
- support inbox triage;
- request classification and routing;
- internal summaries;
- escalation gates;
- lightweight workflow automation.

It does NOT prove autonomous customer support, production deployment, ROI, response-time improvement, or integration with a specific helpdesk.

## Next executable cursor

`IMPLEMENT_SYNTHETIC_FIXTURES_AND_TRIAGE_RUNNER -> ADD_CI_ACCEPTANCE_TEST -> CAPTURE_EVIDENCE_ARTIFACT -> BUILD_CLIENT_FACING_VISUAL -> ADD_TO_FIVERR_CONTRA_PUBLICATION_PACKETS`
