/**
 * Per-activation localStorage key helper.
 *
 * WordPress installs on different hosts (and DDEV/staging vs production)
 * share the SAME browser `localStorage`. Any persisted SPA state stored
 * under a fixed key therefore bleeds across sites — e.g. the setup
 * wizard draft from a local DDEV site showing up on a live site opened
 * in the same browser. Namespacing every persisted key by the
 * activation discriminator isolates each install.
 *
 * Discriminator order: the activation UUID (`activation_id`, unique per
 * install) is preferred; we fall back to `domain` (older PHP builds
 * predating the activation-id bootstrap), then a literal `default` so
 * the key is always well-formed (SSR / tests / pre-bootstrap).
 */
export function perActivationStorageKey(base: string): string {
  if (typeof window === "undefined") return `${base}:default`;
  const cfg = window.structuraConfig;
  const discriminator = cfg?.activation_id || cfg?.domain || "default";
  return `${base}:${discriminator}`;
}
