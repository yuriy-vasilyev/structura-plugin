/**
 * `@structura/visual-signatures` — the public half of the visual signature
 * library (specs/visual-signatures.md §3): ids, versions, medium, palette
 * roles, plan and thumbnails, plus the brand-palette-to-roles math. The
 * prompt bodies stay in `functions/src/visualSignatures/catalog.ts`.
 *
 * Consumed as a `workspace:*` dependency by web / client and mirrored into
 * `functions/src/visualSignatures/meta/` via `pnpm sync:visual-signatures`
 * (Firebase deploy cannot follow pnpm symlinks).
 */
export * from "./types";
export * from "./signatures";
export * from "./palette";
