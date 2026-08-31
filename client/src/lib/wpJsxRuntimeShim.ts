/**
 * Install the React 17+ automatic JSX runtime onto WordPress's `wp.element`
 * when it doesn't already provide one.
 *
 * WP's `wp.element` predates the automatic runtime and (on some versions)
 * exposes `createElement` but not `jsx` / `jsxs`. Dependencies bundled with the
 * automatic runtime — e.g. `@structura/ui` — call `jsx(type, props, key)` /
 * `jsxs(...)`, where the CHILDREN live in `props.children` and `key` is the
 * THIRD argument.
 *
 * The original shim aliased these straight to `createElement`, whose 3rd
 * argument is a CHILD, not a key. So a keyed automatic-runtime call like
 * `jsx(Tooltip, { children: chip }, "https://x.com")` became
 * `createElement(Tooltip, { children: chip }, "https://x.com")` — the key
 * string OVERWROTE `children`, handing components a string where they expected
 * an element. It surfaced as a hard crash on the onboarding competitors step
 * (2026-07-20): the keyed, tooltip-wrapped competitor chips gave `<Tooltip>` a
 * string child, and its `cloneElement(children)` threw React #130. Non-keyed
 * automatic-runtime calls survived (no 3rd arg), which is why only KEYED
 * `@structura/ui` renders broke — a tiny, easy-to-miss slice.
 *
 * The correct shim keeps children in `props` and hoists `key` into the config
 * so `createElement` extracts it as a key rather than a child.
 */
type CreateElement = (type: unknown, config: unknown) => unknown;

interface WpElementLike {
  jsx?: unknown;
  jsxs?: unknown;
  jsxDEV?: unknown;
  createElement: CreateElement;
}

export function installWpJsxRuntimeShim(element: WpElementLike): void {
  // WP already ships a real automatic runtime — leave it alone.
  if (typeof element.jsx === "function") return;

  const jsx = (type: unknown, props: Record<string, unknown>, key?: unknown) =>
    element.createElement(type, key === undefined ? props : { ...props, key });

  element.jsx = jsx;
  element.jsxs = jsx;
  element.jsxDEV = jsx;
}
