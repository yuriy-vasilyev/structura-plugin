export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  /** Optional warning from the model catalog (e.g. "Requires org verification"). */
  warning?: string;
  /**
   * Optimised for speed/cost. Used by the cloud for technical jobs
   * (SERP heading extraction, scraping). HIDDEN from the BYOK model
   * picker — fast models underperform on long-form content
   * generation and we don't want users picking them for posts.
   */
  fast?: boolean;
  /**
   * The provider's quality-top text model. The picker tags this
   * entry with a "Recommended" pill AND `getRecommendedModel` on the
   * cloud side reads it as the default for BYOK suggestion calls.
   * Distinct from `default: true` because Anthropic's catalog leaves
   * Sonnet as `default: true` for back-compat while marking Opus as
   * `recommended: true`.
   */
  recommended?: boolean;
}
