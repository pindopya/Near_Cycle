# Full Frontend QA Matrix

This matrix is the execution checklist for the full browser QA. Dynamic routes use test-owned Donation/Report records.

| Route | Access | Primary interactions to exercise | Expected result |
| --- | --- | --- | --- |
| `/` | Public | location permission success/deny, locate button, category input/clear, radius slider, marker popup, detail link, desktop/mobile nav | nearby API refreshes correctly; map remains usable; no blocked controls |
| `/login` | Public | valid login, invalid login, register link, `next` redirect | correct error or authenticated redirect |
| `/register` | Public | valid registration, duplicate/invalid input, confirm mismatch, login link | account created or clear validation/error state |
| `/donations/new` | USER/ADMIN | location picker open/back/confirm/current GPS, all fields, image select/remove, cancel, create | protected redirect when guest; valid Donation created once |
| `/donations/[id]` | Public | back, image thumbnail/lightbox/close, navigate, report, owner edit/out-of-stock/delete | actions appear by role/status and produce correct backend state |
| `/donations/[id]/edit` | Owner | load existing values, location picker, add/remove images, cancel, save, image-upload retry state | non-owner blocked; updates persist without duplicate PATCH/Create |
| `/donations/[id]/navigate` | Public | GPS allow/deny, back, recenter, sheet expand/collapse, start/stop, retry/reroute states | only active Donation routes; errors recover without broken UI |
| `/donations/[id]/report` | USER/ADMIN | guest redirect, reason radios, description, cancel, submit | creates PENDING report and returns to detail with success state |
| `/admin` | ADMIN | summary cards, map link, logout, mobile menu | non-admin redirected; counts/routes work |
| `/admin/users` | ADMIN | nav, suspend/reactivate test user | status persists; self-suspend protection remains enforced |
| `/admin/donations` | ADMIN | detail link, hide/show, delete test Donation | moderation state persists and public visibility changes |
| `/admin/donations/[id]` | ADMIN | back, related Report links, hide/show, delete | hidden records remain visible to Admin only |
| `/admin/reports` | ADMIN | report detail links/nav | list and status chips match backend |
| `/admin/reports/[id]` | ADMIN | Donation detail, hide, suspend owner, delete Donation, resolve | each action updates correct resource and disabled state |

## Cross-route responsive checks

Every canonical route above is swept at Desktop 1440×900, Tablet 820×1180 and Mobile 390×844 for:

- document horizontal overflow
- controls clipped outside the viewport
- fixed/sticky/map overlays covering actionable controls
- visible control center blocked by another element
- modal/lightbox/map-picker stacking and body-scroll behavior
- mobile menus opening/closing and remaining tappable
- destructive confirmation dialogs returning to a usable page
- loading/error/empty states fitting the viewport

## Diagnostics

During flow execution capture:

- `console.error`
- uncaught page errors
- failed browser requests
- unexpected API 4xx/5xx responses in the exercised flow
- broken links or redirects
- screenshots/traces/videos on Playwright failures

## Test-data rule

USER/ADMIN destructive checks must act only on seed/test-owned records. Unique `e2e-*` identities or clearly named E2E Donation records are used so cleanup can target QA data without touching normal records.
