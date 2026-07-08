# wp-admin plugin SPA e2e (Playwright)

Browser-real smoke tests for the plugin's wp-admin SPA. The SPA runs
**embedded in WordPress**, so — unlike the jsdom unit tests — these load it
where it actually lives (a real wp-admin page) and catch the "wp-admin went
blank during a client demo" class: a bundle that throws on boot, a route that
crashes, an error boundary that trips.

## Prerequisites (local)

This suite runs against a local **ddev** WordPress with the built plugin
assets — there is no dev server to boot. One-time setup:

```bash
# 1. Build the plugin SPA assets (writes plugin/assets/structura.js)
pnpm build:client

# 2. Bring up WordPress with the plugin active
ddev start

# 3. Create the dedicated e2e admin (idempotent — skip if it exists)
ddev wp user create structura_e2e e2e@structura.test \
  --role=administrator --user_pass='e2e-Passw0rd!'
```

## Run it

```bash
pnpm test:e2e:wp            # from the repo root
pnpm --filter client e2e:ui # interactive
```

Overrides via env: `WP_BASE_URL` (default `http://structura-core.ddev.site`),
`WP_ADMIN_USER` (default `structura_e2e`), `WP_ADMIN_PASS`.

## How it works

- **Auth:** `global-setup.ts` logs into `wp-login.php` once and saves the
  session to `e2e/.auth/state.json` (git-ignored); specs reuse it.
- **Coverage:** `smoke.spec.ts` loads the plugin admin page and each in-app
  HashRouter route (`?page=structura#/<route>`), asserting the SPA mounted
  (`#structura-root` is non-empty), the error boundary did not render, and no
  uncaught exception fired. Cloud-backed data may be empty/erroring without a
  connected license on a local WP — that's a handled state, not a crash, and
  the console guard (`support/fixtures.ts`) ignores that noise.

## Why this isn't in the merge-gate CI (yet)

It needs a full WordPress + MySQL + built plugin assets (ddev). Running that
in GitHub Actions is heavy and flaky compared to the portal/www suites, which
only need a dev server (+ emulators). So this stays a **local / pre-release**
suite for now. A future option is the `ddev/github-action-setup-ddev` action
on a nightly (not per-PR) schedule; wire that once the suite has earned trust
locally.
