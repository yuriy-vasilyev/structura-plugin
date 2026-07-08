# Structura — WordPress plugin source

This repository contains the complete source code for the
[Structura](https://structurawp.com) WordPress plugin as distributed on
WordPress.org, including the human-readable source for every compiled
asset that ships in the plugin ZIP.

| Path | What it is |
| --- | --- |
| `plugin/` | The WordPress plugin — PHP source and `readme.txt`. The compiled admin app is built into `plugin/assets/` (not committed here). |
| `client/` | TypeScript/React source for the wp-admin SPA. Compiles to `plugin/assets/structura.js` + `structura.css`. |
| `packages/` | Shared workspace packages used by the SPA build (`@structura/ui`, `@structura/types`, `@structura/tailwind-config`, `@structura/i18n-contracts`). |

## Building the admin app from source

Requires Node 22 and [pnpm](https://pnpm.io) 9.

```bash
pnpm install --frozen-lockfile
pnpm --filter "@structura/*" build   # shared packages first
pnpm --filter client build          # tsc && vite build → emits into plugin/assets/
```

This produces `plugin/assets/structura.js`, `structura.css`, and
`structura.asset.php` — the same compiled assets that ship in the
distributed plugin ZIP for the same version.

## PHP dependencies

The plugin's only production Composer dependency is
[`woocommerce/action-scheduler`](https://github.com/woocommerce/action-scheduler):

```bash
cd plugin
composer install --no-dev
```

## About this repository

This is a read-only source mirror, synced automatically from our private
monorepo every time a WordPress.org release build is produced. Issues and
pull requests here are not monitored — please use the support channels at
[structurawp.com](https://structurawp.com) instead.

## License

GPL-2.0-or-later — see [LICENSE](LICENSE).
