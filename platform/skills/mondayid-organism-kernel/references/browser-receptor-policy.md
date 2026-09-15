# MondayID Browser Receptor Policy — Mobile First

Status: correction gene promoted from repeated browser-auth failure on 2026-09-15.

## Problem class

A browser preview was repeatedly presented to Dima as if it were an interactive browser. On iPhone he could scroll the remote page but could not type credentials. This created false handoffs, repeated setup loops, and unnecessary recommendations to use a desktop/Opera despite an iPhone-only workflow.

The underlying provider connectors were healthy:
- GitHub connector authenticated and operational;
- Vercel connector authenticated and able to read the real `mondayid-host` project;
- Browser UI session remained separately unauthenticated.

Root cause: **connector OAuth/session != cloud-browser session**, and **live preview != user takeover**.

## Correct routing law

For web/account work, route in this order:

1. **Native authenticated connector/app first** when it exposes the required read/write action.
2. **Direct API/tool action** next when authorized and available.
3. **Cloud browser only for missing UI-only capability.**
4. If login or human interaction is required, explicitly request/enter **secure takeover mode** before telling the user to interact.
5. On mobile-only users, never require a desktop merely because the current browser receptor was used incorrectly.
6. Browser extensions such as Opera Browser Connector are optional receptors, not prerequisites for core MondayID continuity.

## Secure takeover law

A live browser preview is observational until takeover is explicitly available/activated.

When the site requires credentials:
- pause at the verified login origin;
- invoke the browser's secure user-takeover/handoff flow;
- never ask for passwords, MFA codes, API keys, or other credentials in chat;
- let credentials go directly to the secure remote browser form;
- after user completion, resume the same browser session;
- verify authentication by reading an authenticated page/state before continuing;
- preserve the signed-in browser session until it expires; do not force repeat login without evidence that the session is gone.

## Mobile-first invariant

Dima's operational path must be usable from the ChatGPT mobile app without requiring access to a physical computer unless the target service itself truly requires desktop-only behavior.

If a browser step appears impossible on mobile:
1. verify whether the UI is merely in preview instead of takeover;
2. inspect native connectors/apps;
3. inspect current Cloud Browser/Work capabilities;
4. try secure takeover;
5. only then surface a genuine platform/site blocker.

Do not prescribe Opera/desktop setup as the first fallback.

## Browser session vs connector session

Treat these as separate receptors:
- `github_connector_auth`
- `vercel_connector_auth`
- `cloud_browser_session`
- `connected_local_browser_session`

Authentication in one does not imply authentication in another.

Never diagnose `GitHub disconnected` or `Vercel disconnected` solely because a cloud browser lands on their login page. Probe the native connector independently first.

## Browser failure taxonomy

- `PREVIEW_NOT_TAKEOVER`: user can see/scroll but cannot type or click interactive controls as expected.
- `BROWSER_SESSION_UNAUTHENTICATED`: cloud browser has no session cookie despite connector auth.
- `CONNECTOR_AUTH_HEALTHY`: native connector succeeds even if browser is logged out.
- `SITE_BLOCKS_AUTOMATION`: site prevents the agent from proceeding; attempt takeover where supported.
- `TAKEOVER_REQUIRED`: secure user interaction is needed.
- `TAKEOVER_UNAVAILABLE`: browser implementation cannot hand control to the user; select another authorized receptor.
- `SESSION_EXPIRED`: previously authenticated browser session no longer proves auth.

## Acceptance test

Given:
- user is on iPhone/mobile only;
- GitHub/Vercel native connectors are authenticated;
- browser preview opens Vercel login and the user says they cannot type;

MondayID must:
1. verify native connectors independently;
2. classify the browser problem as session/takeover-layer, not connector failure;
3. explicitly invoke secure takeover on the login page;
4. avoid asking the user to paste credentials into chat;
5. avoid requiring desktop/Opera;
6. resume the same browser session after successful user login;
7. use native connectors for every action they already cover;
8. use browser only for the uncovered UI-only operation;
9. record the correction so the same preview-vs-takeover mistake does not recur.

## Evidence from current incident

- New browser session independently reproduced unauthenticated Vercel login.
- GitHub native connector simultaneously returned the authenticated user profile.
- Vercel native connector simultaneously returned the real `mondayid-host` production project.
- Explicit browser continuation requesting secure user takeover returned: takeover is supported through the live preview; Vercel login is paused for user control.

Promotion state: `ENCODED + DIRECTLY TESTED`.
Transfer state: require later heterogeneous browser-auth task before `LEARNED`.
