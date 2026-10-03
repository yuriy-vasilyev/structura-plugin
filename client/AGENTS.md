# client/ (wp-admin SPA) — read before changing anything here

Rules for this package: `../agents/frontend.md` §1 and §2. Cross-cutting
rules: `../AGENTS.md`. Design: `../specs/design-guide.md`. Browser e2e:
`e2e/README.md`.

Non-negotiable here: `@structura/ui` primitives and tokens, both colour
modes, `__("text", "structura")` on every string, Tailwind `!` REQUIRED for
margins and heading display (wp-admin resets them), `pnpm --filter client
makepot` after adding strings (git add new files first).
