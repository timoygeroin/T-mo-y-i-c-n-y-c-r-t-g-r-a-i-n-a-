# Lead Intake Triage — MondayID Portfolio Proof

This is a synthetic demonstration, not a client case study.

## Problem

Inbound requests often arrive in one shared inbox and require repetitive manual work: read the message, decide what it is, choose urgency, route it to the right queue, and avoid sending anything externally until a human approves it.

## Demonstrated workflow

INPUT
→ NORMALIZE
→ CLASSIFY
→ PRIORITIZE
→ ROUTE
→ HUMAN APPROVAL GATE
→ AUDIT RECEIPT

The demo deliberately prevents all external sends. Every input receives a deterministic route plus a receipt containing source provenance and hashes.

## Proof set

Six synthetic requests cover:

- sales inquiry;
- broken workflow/support issue;
- billing issue;
- security/access issue;
- partnership inquiry;
- general question.

## Acceptance tests

PASS requires all of the following:

1. every sample produces one receipt;
2. no sample is silently dropped;
3. security/access request routes to security review with urgent priority;
4. sales request routes to sales queue;
5. support request routes to support queue;
6. billing request routes to billing queue;
7. partnership request routes to partnerships;
8. unknown/general request routes to general inbox;
9. zero external sends occur;
10. every receipt explicitly records `HUMAN_APPROVAL_REQUIRED`.

## What this demonstrates

- structured business-process mapping;
- deterministic routing around an AI-ready workflow boundary;
- human approval design;
- auditability and provenance;
- safe default behavior before connecting real accounts.

## What this does not claim

- no real customer or company is represented;
- no revenue or efficiency improvement is claimed;
- no production deployment is claimed;
- no external CRM, email, or API credentials are used.

The same pattern can be extended with authorized APIs, AI extraction/classification, CRM writes, Slack/Teams notifications, browser automation permitted by a target service, and client-specific acceptance tests.
