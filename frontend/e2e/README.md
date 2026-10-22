# Frontend E2E QA Harness

Playwright is used for browser-level functional, responsive, clickability, console and network QA.

## Disposable local stack

The E2E suite uses only `e2e-*` fixture accounts/data. Passwords are supplied through environment variables and are never stored in committed files.

```bash
# repository root
export E2E_USER_PASSWORD='<temporary user password>'
export E2E_ADMIN_PASSWORD='<temporary admin password>'
export E2E_DISABLE_RATE_LIMIT=true

docker compose up -d db backend frontend

# install Chromium once on the host if needed
cd frontend
npx playwright install chromium

# fixture setup/cleanup is automatic through Playwright global setup/teardown
npm run test:e2e

# repository root, after the run
cd ..
docker compose down -v
```

`E2E_DISABLE_RATE_LIMIT=true` is honored only when `NODE_ENV` is not `production`. Production rate limiting cannot be disabled by this E2E switch.

Optional variable:

- `E2E_BASE_URL` — defaults to `http://localhost:3000`

Destructive E2E tests must operate only on identifiable `e2e-*` records. Global teardown deletes those accounts, their cascaded Donation/Report data, and any uploaded image files owned by them.

## Viewports

The full suite runs serially on:

- Desktop Chromium — 1440 × 900
- Tablet Chromium — 820 × 1180
- Mobile Chromium — 390 × 844

## Shared QA checks

`helpers/qa.js` provides checks for:

- horizontal overflow
- horizontally clipped interactive controls
- controls whose visible center is covered by another element
- uncaught browser errors
- console errors
- failed network requests
- inventory of visible buttons, links and form controls

The flow-specific specs use these helpers and fix/retest reproduced issues before the corresponding QA phase is closed.
