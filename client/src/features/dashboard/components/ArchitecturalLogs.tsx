/**
 * @deprecated Retired under `specs/plugin-quiet-mode.md` §5.3.
 *
 * The Architectural Logs ticker used to occupy the Overview page's right-hand
 * column. Live visibility is now the progress drawer
 * (`specs/progress-stream.md`); recent failures surface through the Needs
 * Attention widget (`specs/run-detail-view.md` §6); full log tables moved
 * behind Settings → Advanced → Debug mode.
 *
 * The file is kept as a short placeholder rather than deleted outright so
 * `git log` retains a pointer to the retirement — if anything still imports
 * from here during rollout (third-party customisations, forgotten release
 * branches), the build fails loudly rather than silently rendering a stale
 * log widget.
 */
export {};
