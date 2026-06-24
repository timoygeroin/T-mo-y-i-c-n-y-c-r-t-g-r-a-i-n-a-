# Status Readback Authority Lease Receipt

## Purpose

This receipt records the executable routing gain added after the PR head had moved beyond the repaired-head readback surface.

## New behavior

`compileStatusReadbackAuthorityLease` binds status authority to three facts at once:

- the active manifestation branch;
- the live PR head SHA;
- concrete status surface identifiers such as check runs or workflow runs.

If the PR head moves, the previous status authority expires. A repaired-head success can remain historical evidence, but it can no longer authorize current release, repair, or readiness claims.

## Current routed pressure

- Historical repaired head: `b38ea247602ae8ebba80c4120ad03b41b26bd841`.
- Live PR head observed through PR metadata: `be8e3d080cd897038154ec405c6e55e23f7bb248`.
- Required next status authority: a lease bound to the live head, not to the repaired historical head or a PR-body summary.

## Future-routing effect

A future finalization pass must either:

1. attach a live-head status surface and receive a current status lease;
2. expire the old lease and obtain fresh current-head status evidence;
3. route a failing leased surface to current-head repair;
4. or emit one exact external blocker.

It may not reuse the repaired-head success as current authority after the branch has moved.
