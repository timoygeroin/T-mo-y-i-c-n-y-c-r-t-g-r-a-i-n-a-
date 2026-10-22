# Monday Work — first unattended, measurable execution loop

Date: 2026-10-22. This extends the pre-existing Workless journal and Surface 02. It is not a second app.

## Why

A chat ends when a reply ends. An actual independent execution source must run without the user clicking Continue. The repository already has code, tests, a durable journal, effect routing and hosting, but until this change lacked an unattended trigger.

## What runs, for real

The workflow at .github/workflows/monday-work-cycle.yml is configured for an hourly GitHub Actions schedule at minute 23 UTC. It also supports manual dispatch, triggers on its own relevant source changes and verifies code in pull requests.

Each run:
1. Checks focused route/unit tests and syntax without using an external AI model.
2. Runs scripts/monday-work-cycle.mjs on **main** only. It fetches five public JS files and compares their SHA-256 bytes to the checked-out canonical repository. No user notes, cookies, passwords, tokens, model API calls or browser files are sent.
3. Rejects stale, missing or unreachable files rather than misreporting success.
4. Writes a bounded monday.work-cycle.v1 report into a GitHub Actions artifact retained for 14 days, and exposes the run result through GitHub Actions' own public run history.

Surface 02 Work now has a separate **Проверки без нового сообщения** section. It retrieves actual GitHub Actions runs through a public read-only API with fixed repository and validated numeric run links. It never labels a saved task as currently executing. If the workflow has not run or GitHub is unavailable, it says so.

## Truth boundaries

- **This is unattended automated QA**, not an independent coding agent or a continuously running LLM. A healthy watch does not prove MondayID as a whole is finished.
- GitHub schedules may be delayed, rate-limited, or disabled after repository inactivity. Check actual run timestamps before claiming a schedule is operating.
- The runner has a hard time limit and read-only repository permission. It does not merge code, deploy apps, spend money, modify user data or fire arbitrary scripts from the public website.
- Reports are not private and must never include private conversation contents.
- AI/host/identity integration and verified state synchronization are separate milestones. Do not fabricate them merely because the watch runs hourly.
- A dashboard must show **verified source activity, not a synthetic heartbeat**.

## Owner verification

Open the existing site's Work screen and the workflow's Actions run list in the canonical GitHub repository. Read the outcome, timestamp and report artifact. On stale or failed reports investigate and implement an independently tested repair in a new PR; do not auto-deploy based solely on a status flag.

Tests: node --test tests/monday-work-cycle.test.mjs tests/work-cycle-evidence.test.mjs tests/surface-work-evidence.test.mjs. Full repo npm test + boot and authorization proof is still the acceptance gate.
