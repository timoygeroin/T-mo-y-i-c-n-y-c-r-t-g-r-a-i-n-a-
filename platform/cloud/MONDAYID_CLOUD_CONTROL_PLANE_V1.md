# MONDAYID CLOUD CONTROL PLANE V1

Status: `BOOTSTRAP_READY`

## Objective

Operate and evolve MondayID without requiring Dima to own or maintain a local computer.

The iPhone is the control plane. Cloud execution is the body. GitHub is the versioned truth surface.

## Runtime topology

### 1. Command surface

- ChatGPT mobile: reasoning, connected sources, approvals, reviews, scheduled or conditional work.
- Mobile browser: direct access to Codex Cloud when the mobile app does not expose the full Codex surface.

### 2. Primary execution

- Codex Cloud checks out a selected repository branch into an isolated cloud container.
- It runs setup scripts, terminal commands, tests, proof scripts, and code changes without a local machine.
- Parallel tasks use isolated cloud environments and return reviewable diffs.

### 3. Durable state

- GitHub stores code, `AGENTS.md`, governance, proof receipts, issues, pull requests, and CI history.
- The open branch lineage must remain explicit until audited and intentionally integrated.
- Private corpus content remains in approved private stores and enters Git only as hashes, manifests, schemas, or redacted evidence.

### 4. Deployment surfaces

Use the smallest fitting cloud surface for each product:

- GitHub Actions for repeatable tests, proofs, scheduled repository jobs, and release checks.
- Existing Base44 `MondayID` as a seed kernel and product interface candidate, not yet the authoritative runtime.
- Existing Replit apps only after inspection. Do not create another duplicate shell by default.
- A dedicated deployed service only when a real runtime contract, health check, storage model, and credential boundary are defined.

## Why Remote is not the bootstrap path

ChatGPT Remote controls work running on a paired Mac, Windows computer, devbox, or SSH environment. Initial pairing requires the desktop app on a host. Since Dima has no host computer, Remote cannot be the first organ.

Codex Cloud is the bootstrap path because it supplies its own isolated execution containers and can start from the web with a GitHub repository.

Remote may be added later if an always-on managed host is provisioned, but the system must remain operable without it.

## First cloud task contract

The first Codex Cloud task must:

1. inspect the repository and open PR chain without merging anything;
2. map executable packages, workflows, proof scripts, incomplete organs, and stale branches;
3. identify the minimum runnable MondayID vertical slice;
4. add one cloud-native smoke path that can run in Codex Cloud and GitHub Actions;
5. produce evidence-backed status with exact commands and results;
6. keep secrets and private corpus bytes out of the repository.

## Acceptance tests for V1

- A Codex Cloud environment can check out `agent/mondayid-cloud-control-plane-v1`.
- The root `AGENTS.md` is read and followed.
- Repository setup completes or returns a precise reproducible blocker.
- At least one real package, proof, or service path executes in the cloud.
- A pull request contains the implementation diff, test evidence, unresolved remainder, and next active target.
- No local computer is required for any acceptance step.

## Human gates

Explicit approval from Dima remains required for:

- merging competing historical branches;
- creating or exposing secrets;
- paid infrastructure or API spend;
- public deployment under the MondayID name;
- identity, legal, contract, treasury, or payment actions;
- deletion or irreversible migration of existing cloud assets.

## Immediate route

`CONNECT_CODEX_CLOUD -> SELECT_GITHUB_REPO -> SELECT_BRANCH -> CREATE_ENVIRONMENT -> RUN_FIRST_CLOUD_AUDIT -> REVIEW_DIFF -> OPEN_PR`
