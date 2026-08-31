/**
 * `@structura/model-catalog` — the single source of truth for AI model data.
 *
 * Consumed as a `workspace:*` dependency by web / www / client (their bundlers
 * inline it) and mirrored into `functions/` via `pnpm sync:model-catalog`
 * (Firebase deploy can't follow pnpm symlinks). Everything here derives from
 * the one {@link MODELS} array in `model-data.ts`.
 */
export * from "./types";
export { MODELS } from "./model-data";
export * from "./catalog";
export * from "./bindings";
export * from "./pricing";
