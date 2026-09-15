# MondayID Browser Receptor Policy — Mobile First

Status: correction gene promoted from repeated browser-auth failures on 2026-09-15/16.

## Problem class

A browser preview was repeatedly presented to Dima as if it were an interactive browser. On iPhone he could scroll the remote page but could not type credentials. This created false handoffs, repeated setup loops, and unnecessary recommendations to use a desktop/Opera despite an iPhone-only workflow.

The underlying provider connectors were healthy:
- GitHub connector authenticated and operational;
- Vercel connector authenticated and able to read the real `mondayid-host` project;
- Browser UI session remained separately unauthenticated.

A second failure then appeared: even after an explicit takeover request on the Browser Use connector, the resumed session still returned to Vercel login and the user reported the takeover UI itself was unusable on mobile.

Root causes:
1. **connector OAuth/session != browser session**;
2. **live preview != interactive user takeover**;
3. **Browser Use connector != ChatGPT Work Cloud Browser**;
4. a connector/browser implementation advertising takeover support is not enough evidence that takeover is usable on the user's actual client.

## Receptor distinction

Treat these as separate organs with different capabilities and session state:
- `github_connector_auth`
- `vercel_connector_auth`
- `browser_use_connector_session`
- `work_cloud_browser_session`
- `connected_local_browser_session`

Never collapse them into a generic `browser` capability.

### Browser Use connector

Use for public navigation and browser workflows only when its actual UI behavior is sufficient on the current client.

Do **not** assume:
- connector OAuth is inherited;
- credentials can be typed merely because a live preview is visible;
- a reported takeover capability is usable on mobile until a real user interaction succeeds;
- its session persistence matches Work Cloud Browser.

### ChatGPT Work Cloud Browser

This is the preferred browser receptor for substantial multi-step website work that requires interactive login/takeover or long browser workflows. It belongs to Work mode, not to an ordinary chat merely because a Browser Use plugin is present.

When Work Cloud Browser is required and not available in the current surface, route the task to Work mode rather than pretending another browser receptor is equivalent.

## Correct routing law

For web/account work, route in this order:

1. **Native authenticated connector/app first** when it exposes the required read/write action.
2. **Direct API/tool action** next when authorized and available.
3. If a UI-only action remains, prefer **Work Cloud Browser** for substantial authenticated browser work.
4. Use **Browser Use connector** only when its concrete current-client interaction capability is sufficient and already demonstrated.
5. If login/human interaction is required, use the browser receptor's secure takeover/handoff only after confirming that takeover is actually interactable on the user's device.
6. On mobile-only users, never require a desktop merely because the wrong browser receptor was selected.
7. Browser extensions such as Opera Browser Connector are optional receptors, never prerequisites for MondayID continuity.
8. If no usable browser receptor exists, continue every possible native connector/API action and surface only the exact UI-only blocker.

## Secure takeover law

A live browser preview is observational until takeover has **actually succeeded on the current client**.

When a site requires credentials:
- verify the login origin;
- invoke the appropriate secure takeover/handoff;
- never ask for passwords, MFA codes, API keys, or other credentials in chat;
- let credentials go directly to the secure browser form;
- require an explicit successful user interaction before assuming takeover worked;
- after user completion, resume the same browser session;
- verify authentication by reading an authenticated page/state before continuing;
- if resume returns to login, classify the session as not preserved and do not ask the user to repeat the same broken flow indefinitely.

## Mobile-first invariant

Dima's operational path must be usable from the ChatGPT mobile app without requiring access to a physical computer unless the target service itself truly requires desktop-only behavior.

If a browser step appears impossible on mobile:
1. probe native connectors/apps first;
2. separate connector auth from browser auth;
3. identify whether the current browser is Browser Use or Work Cloud Browser;
4. if using Browser Use and login/takeover is unreliable, stop retrying it;
5. move the browser task to Work mode when Work Cloud Browser is the correct receptor;
6. continue all non-browser work through native connectors/APIs;
7. only then surface a genuine platform/site blocker.

Do not prescribe Opera/desktop setup as the default fallback.

## Browser failure taxonomy

- `PREVIEW_NOT_TAKEOVER`: user can see/scroll but cannot type or interact as required.
- `BROWSER_SESSION_UNAUTHENTICATED`: browser has no session cookie despite connector auth.
- `CONNECTOR_AUTH_HEALTHY`: native connector succeeds even if browser is logged out.
- `WRONG_BROWSER_RECEPTOR`: task requires Work Cloud Browser but Browser Use connector was selected.
- `TAKEOVER_ADVERTISED_NOT_USABLE`: implementation reports takeover support but the user's client cannot actually interact.
- `SESSION_NOT_PRESERVED_AFTER_TAKEOVER`: resume returns to login after user attempted takeover.
- `SITE_BLOCKS_AUTOMATION`: site prevents automated continuation.
- `TAKEOVER_REQUIRED`: secure human interaction is genuinely required.
- `TAKEOVER_UNAVAILABLE`: current browser receptor cannot hand control to the user.
- `SESSION_EXPIRED`: a previously authenticated browser session no longer proves auth.

## Acceptance test A — preview/takeover

Given:
- user is on iPhone/mobile only;
- GitHub/Vercel native connectors are authenticated;
- Browser Use preview opens Vercel login;
- user can scroll but cannot type;

MondayID must:
1. verify native connectors independently;
2. classify the browser problem as session/receptor-layer, not connector failure;
3. avoid asking for credentials in chat;
4. avoid requiring desktop/Opera;
5. attempt secure takeover at most as a real capability check;
6. if takeover remains unusable or auth is not preserved, stop retrying that receptor;
7. use native connectors for every action they already cover;
8. route remaining authenticated UI work to Work Cloud Browser / Work mode;
9. record the correction.

## Acceptance test B — connector vs browser state

Given:
- GitHub connector returns authenticated profile;
- Vercel connector returns the real project and deployment;
- Browser Use still redirects to Vercel login;

MondayID must conclude:
- GitHub is connected;
- Vercel is connected;
- Browser Use session is separately unauthenticated;
- connector health must not be downgraded because the browser session is logged out.

## Evidence from incident

- Fresh Browser Use session independently reproduced unauthenticated Vercel login.
- GitHub native connector simultaneously returned the authenticated user profile.
- Vercel native connector simultaneously returned the real `mondayid-host` production project.
- Browser Use reported secure takeover support, but after user interaction/resume the session still returned to login.
- User explicitly reported the takeover flow did not work on the mobile client.
- Current public `mondayid-host` still returns 404 for `/api/organism/health`, proving production has not yet incorporated the new serverless runtime.

Promotion state: `ENCODED + DIRECTLY TESTED`.
Transfer state: require later heterogeneous browser-auth task before `LEARNED`.
