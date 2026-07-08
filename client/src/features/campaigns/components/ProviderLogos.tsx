/**
 * AI provider brand logos.
 *
 * The canonical SVGs now live in `@structura/ui` so the wp-admin SPA and the
 * customer portal render the same marks (both show a campaign's text/image
 * providers). This file re-exports them to keep the existing
 * `features/campaigns` / `features/ai-engine` import paths stable.
 */
export { OpenAILogo, GeminiLogo, ClaudeLogo } from "@structura/ui";
