# MondayID Organism Surface Map

Status: consolidation map, not a deletion list.
Date: 2026-09-15

## Rule

There is one organism and multiple historical/project surfaces. A project name is not an identity boundary.

Do not create another “main” Monday project when an existing primary surface can be repaired. Do not delete legacy/probe projects until their useful state, secrets, domains, logs, and code ancestry have been inspected.

## OpenAI Platform

Organization: `MondayiD`

### PRIMARY — `MondayiD`

Project ID: `proj_aTKPT6LJSBCo1NXKAEVZ2jR9`
Role: current OpenAI compute/API substrate for the Organism Host runtime.
Current action: create/use `MondayID Host Runtime` API key here.

### LEGACY / ANCESTRY — `Alpha iD`

Project ID: `proj_SgQxVdZjLfItACBmCBFnBzln`
Role: historical project. Do not use for new organism runtime work unless inventory proves a unique required resource lives here.
Disposition: inspect before archive; do not delete blindly.

### PLATFORM DEFAULT — `Default project`

Project ID: `proj_jvcWtNZ7MHdU2k7XgzX2YTAh`
Role: initial/default OpenAI Platform project.
Disposition: not the canonical MondayID runtime target; preserve until keys/usage/resources are inventoried.

## Vercel

Team: `team_FwRqJf7aaU68ASUeOCJ2vgXq`
Plan observed: Hobby.

### PRIMARY EXTERNAL BODY — `mondayid-host`

Project ID: `prj_UgZX7OjLZxnFc4rixQ7N1SbO5xMC`
Canonical domain: `mondayid-host.vercel.app`
Observed production deployment: `dpl_6UGMaSLv9opHm8hDudtGWiN1kXHi`, READY.
Observed deployment shape before organism integration: static/manual upload (4 deployment files, no Git link).
Target role: the one user-facing web body for current MondayID.
Target source: the existing GitHub monorepo, with Vercel Root Directory = `platform` and `platform/vercel.json` controlling build + serverless organism API.

### LEGACY / ORGAN DONORS — inspect, do not extend as new mains

- `mondayid-connector` — `prj_rTaMgbI5VnO86YEaWVJ4AEhFdO3H`
- `mondayid-reality-app` — `prj_C3U3QM9C8oJW0JuKNER8RAGBipTw`
- `mondayid-reality` — `prj_CsHxGkRlZdfAKFQcJQqfZaiiwVqQ`
- `mondayid-war-lens` — `prj_3kNgDFXpJjbZP43wS6891qW6U5kX`

Rule: extract any unique useful deployment/config/route behavior into the primary body, then mark ancestry. Do not keep evolving them independently.

### PROBE / TEST SURFACES — evidence fixtures, not organism identities

- `mondayid-connector-probe` — `prj_RBckK2tRfJYMS6It5hbFZJboS7OL`
- `mondayid-israel-relay-probe` — `prj_9vcZ571pqnAPTAKzPd4uFSA1jDBd`
- `mondayid-tzofar-probe` — `prj_KRpoz2KJslNHOP4cf0oRJwcsXZwm`
- `mondayid-reality-contract-test` — `prj_I9jreP3d2HX9W5qY8nwetuYnxrnh`
- `mondayid-war-lens-test` — `prj_Nt9Wk1SSdh4sJHSo4LjEDiotOxUs`

Rule: probes/tests may remain as evidence surfaces until equivalent regression coverage exists in the canonical repository. They are never the place to save new product state.

## GitHub

### PRIMARY CODE BODY

Repository: `timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-`
Current base: `main`
Current organism candidate: `agent/mondayid-organism-kernel-v1`
Current integration PR: `#42` (draft while final gates are running).

### QUARANTINED DONOR

Repository: `timoygeroin/gpt-root`
Role: unrelated legacy GPT-R00T/jailbreak shell; historical anti-example/donor only. Not canonical MondayID authority.

## Canonical save rule from now on

When a new MondayID artifact needs a home:

1. **Runtime/source code** -> primary GitHub repository.
2. **OpenAI model/API resources** -> OpenAI Platform organization `MondayiD`, project `MondayiD`.
3. **Production web body** -> existing Vercel project `mondayid-host`.
4. **Long-term lineage/state/corpus** -> existing MondayID continuity/Library/Drive surfaces according to provenance; do not create a new project merely to hold a document.
5. **Experiments** -> branch/test fixture inside the primary repository first; create a separate provider project only if isolation is technically necessary and record it here immediately.

## Deletion gate

No historical OpenAI/Vercel project is deleted merely to make the dashboard look clean. Archive/delete only after:
- unique resources/secrets/domains/deployments are inventoried;
- useful mechanisms are migrated or explicitly rejected;
- replacement regression tests exist where applicable;
- no production traffic depends on it;
- a receipt records the decision.

Until then the correct state is `LEGACY/PROBE`, not `DELETE`.
