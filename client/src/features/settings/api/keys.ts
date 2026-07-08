export const settingsKeys = {
  all: ["settings"] as const,
  ai: () => [...settingsKeys.all, "ai"] as const,
  seoRules: () => [...settingsKeys.all, "seo-rules"] as const,
  /**
   * Public-site profile — separate from the main settings query because
   * its lifecycle is independent (own GET/POST endpoints, own card,
   * different staleTime). Spec: `specs/site-identity-headless.md` §5.
   */
  publicSiteProfile: () => [...settingsKeys.all, "public-site-profile"] as const,
};

export const visualKeys = {
  all: ["visual"] as const,
  config: () => [...visualKeys.all, "config"] as const,
};
