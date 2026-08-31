import type { AIProvider } from "@structura/types";
import { MODELS } from "./model-data";

/**
 * Historical model ids that are NOT in the current catalog but may still key a
 * lookup — an in-flight or recently-completed batch submitted before a model
 * was retired. Retained so those cost records don't zero out. Values are the
 * post-Batch-discount input price in USD per million tokens.
 *
 * Anything the current catalog carries is derived from {@link MODELS} below and
 * must NOT be duplicated here.
 */
const LEGACY_BATCH_INPUT_PRICES: Readonly<Record<string, number>> = Object.freeze({
  // Retired by the 2026-07-20 model bump (Opus 4.7 → 4.8, Sonnet 4.6 → 5).
  "anthropic:claude-opus-4-7": 2.5,
  "anthropic:claude-sonnet-4-6": 1.5,
  "anthropic:claude-opus-4-6": 2.5,
  "anthropic:claude-opus-4-5": 2.5,
  "anthropic:claude-sonnet-4-5": 1.5,
  "openai:gpt-5": 2.5,
});

/**
 * Curated input-token prices (USD per million tokens) after the 50% Batch
 * discount, keyed `provider:modelId`. Derived from the catalog so a price can
 * never key off a stale/short id (the prior hand-maintained map had
 * `openai:gpt-5.2` and `gemini:gemini-3.1-pro` — neither matches the real
 * `gpt-5.2-2025-12-11` / `gemini-3.1-pro-preview` ids actually submitted, so
 * those lookups silently returned 0). Legacy retirees are merged in for
 * historical records.
 *
 * A model with no entry here yields `null` from {@link lookupBatchInputPrice},
 * and the cost record lands with `estimatedCostUsd: 0` — an INTENTIONAL signal
 * that a price is missing, not a real zero. Add `batchInputUsdPerMTok` to the
 * model in `model-data.ts` and the next submission picks it up.
 */
export const BATCH_INPUT_PRICE_USD_PER_M_TOKENS: Readonly<Record<string, number>> =
  Object.freeze({
    ...LEGACY_BATCH_INPUT_PRICES,
    ...Object.fromEntries(
      MODELS.filter((m) => m.batchInputUsdPerMTok !== undefined).map((m) => [
        `${m.provider}:${m.id}`,
        m.batchInputUsdPerMTok as number,
      ]),
    ),
  });

/**
 * Look up the post-Batch-discount input price for a (provider, model) pair.
 * Returns `null` when the pair isn't priced — caller stamps
 * `estimatedCostUsd: 0` and the missing-price condition stays visible.
 */
export function lookupBatchInputPrice(
  provider: AIProvider,
  model: string,
): number | null {
  return BATCH_INPUT_PRICE_USD_PER_M_TOKENS[`${provider}:${model}`] ?? null;
}
