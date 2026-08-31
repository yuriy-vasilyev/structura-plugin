# @structura/model-catalog

Single source of truth for the AI model catalog: model ids, display names,
per-model batch pricing, capability manifest, per-role defaults, and
managed-tier plan pins.

Everything derives from **one array** — `src/model-data.ts` → `MODELS`. Add,
retire, or re-tier a model there and it propagates to:

- `MODEL_CATALOG` — the object served to plugin installs via `getAvailableModels`.
- `getDefaultModel` / `getRecommendedModel` / `isKnownImageModelForProvider`.
- `PLAN_DEFAULTS` + `getDefaultModelForPlan` / `getPlanModelForProvider` (managed-tier pins; ids referenced here are checked against the catalog by the tests).
- `BATCH_INPUT_PRICE_USD_PER_M_TOKENS` + `lookupBatchInputPrice` (batch cost estimation).
- `CATALOG_MODEL_NAMES` (marketing display names).

## Who consumes it, and how

| Consumer | Mechanism |
| --- | --- |
| `web`, `www`, `client` | `workspace:*` dependency — bundlers inline the built `dist`. |
| `functions` | **Mirrored** into `functions/src/ai/catalog/` by `pnpm sync:model-catalog`, because the Firebase deploy pipeline packs only `functions/` and does not follow pnpm workspace symlinks. CI enforces the mirror is in sync via `pnpm check:model-catalog`. |

Do **not** edit the mirrored copy under `functions/` — edit `src/` here and
re-sync.

## Scripts

```bash
pnpm --filter @structura/model-catalog build   # tsc → dist
pnpm --filter @structura/model-catalog test     # vitest
```

## Changing a model

1. Edit `src/model-data.ts`.
2. If a served-shape or price value changed, update the wire-contract snapshot
   in `src/__tests__/catalog.test.ts` so the change is reviewed explicitly.
3. `pnpm --filter @structura/model-catalog test` — green.
4. `pnpm sync:model-catalog` to refresh the `functions/` mirror, and update any
   managed-tier pins in `src/plan-defaults.ts` that referenced a renamed id.
