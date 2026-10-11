import { compile, optimize } from "@tailwindcss/node";

// jsdom gives modules a non-file import.meta.url; vitest still defines __dirname.
const BASE = __dirname;

/**
 * Values of `property` from every rule, compiled from the element's own classes
 * with the shared theme, whose selector matches the element in the rendered DOM.
 */
export async function matchedDeclarations(el: Element, property: string): Promise<string[]> {
  const compiler = await compile(
    '@import "@structura/tailwind-config/theme.css";\n@tailwind utilities;',
    { base: BASE, onDependency: () => {} }
  );
  // optimize() lowers nesting, so every variant becomes one flat selector.
  const css = optimize(compiler.build([...el.classList])).code;
  const values: string[] = [];
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = selector.trim();
    if (sel.startsWith("@") || !safeMatches(el, sel)) continue;
    for (const decl of body.split(";")) {
      const [name, ...rest] = decl.split(":");
      if (name.trim() === property) values.push(rest.join(":").trim());
    }
  }
  return values;
}

/** Whether `el` matches `selector`, false for selectors jsdom can't parse. */
function safeMatches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}
