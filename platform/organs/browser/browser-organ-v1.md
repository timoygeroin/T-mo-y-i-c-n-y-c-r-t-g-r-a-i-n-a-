# MONDAYID BROWSER ORGAN V1

Status: IMPLEMENTATION_SPEC

## Purpose
Provide MondayID Work with a real browser execution organ for web tasks that are otherwise blocked by the current ChatGPT surface.

## Law
`GOAL -> PAGE MODEL -> ACTION -> READBACK -> RECEIPT -> NEXT ACTION`

The organ must never fabricate page state or account actions. Every mutation requires observable readback.

## Substrate
Vercel Sandbox + headless Chromium + agent-browser.

The installed Vercel sandbox skill explicitly supports browser automation using agent-browser + headless Chrome inside isolated Firecracker microVMs, including navigation, snapshots, multi-step form workflows, screenshots, and sandbox persistence/snapshots.

## Architecture

### 1. Browser Runtime
- Named persistent Vercel Sandbox.
- Chromium + agent-browser preinstalled in a reusable sandbox snapshot.
- Network policy defaults to deny-all with explicit allowed domains per task where practical.
- Session filesystem persists encrypted browser state artifacts only when needed.

### 2. Session Vault
- Stores browser auth state separately from canonical MondayID state.
- Never stores raw credentials in GitHub/Airtable.
- Human login/2FA/ID checkpoints are explicit gates.
- After human authentication, save reusable browser state when the target service permits it.

### 3. Action API
Minimum operations:
- open(url)
- snapshot(interactive=true)
- click(ref|semantic_locator)
- fill(ref|label, value)
- select(ref, option)
- press(key)
- wait(condition)
- get_text(target)
- get_url()
- screenshot()
- save_session()
- load_session()
- close()

### 4. Evidence Envelope
Every action returns:
- task_id
- session_id
- step_index
- requested_action
- pre_url
- post_url
- observable_result
- screenshot_ref when material
- mutation_class
- confidence
- timestamp

### 5. Control Law
Browser Organ is an effector, not decision authority.
MondayID Work decides intent and next action.
The organ executes exactly one bounded web action or bounded atomic sequence, reads the page back, and returns evidence.

### 6. Human Gates
Required for:
- entering passwords/secrets that MondayID does not already hold through an approved secret store
- 2FA / CAPTCHA when automation cannot legitimately complete it
- identity verification / KYC
- binding payout methods
- accepting legal terms when explicit owner consent is required
- irreversible financial transactions unless separately authorized

After the gate, Work resumes from the same session/state rather than restarting.

## First Canary: Income Pocket
Target sequence:
1. Open chosen marketplace seller onboarding.
2. Inspect current requirements and account state.
3. If unauthenticated, stop at LOGIN_GATE with exact current URL and required fields.
4. After user login, save session state.
5. Create/fill MondayID Studio seller profile from canonical commercial package.
6. Build first offer listing.
7. Screenshot + read back final draft.
8. Publish only when platform permissions and owner-consent rules permit.
9. Record listing URL and receipt in income state.

## Success Criteria
- Browser session can survive a stop/resume cycle.
- Can open a public site and return a reliable interactive snapshot.
- Can execute at least one multi-step form workflow in a test surface.
- Can stop at an authentication gate and resume without losing prior state.
- Every mutation has post-action readback.
- Loss of Browser Organ does not redefine canonical MondayID state.

## Non-goals
- bypassing anti-bot systems, CAPTCHAs, KYC, or access controls
- credential theft or hidden impersonation
- mass spam or deceptive marketplace behavior
- claiming earnings or actions not verified by the target site
