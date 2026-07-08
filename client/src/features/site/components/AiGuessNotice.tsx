/**
 * Info banner shown when a list is AI-guessed rather than measured from
 * real search data.
 *
 * Structura markets "real SEO data" — so when DataForSEO has nothing for
 * a domain (new / un-indexed sites) and we fall back to an LLM estimate,
 * we say so plainly. This is informational, not an error: the guesses
 * are useful, they're just not measured. Used on the Competitors and
 * Authority tabs (and anywhere else AI substitutes for provider data).
 */
import { __ } from "@wordpress/i18n";
import { Sparkles } from "lucide-react";

export const AiGuessNotice = ({ message }: { message: string }) => (
  <div className="flex items-start gap-2.5 rounded-md border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-900/40 dark:bg-brand-950/20">
    <Sparkles
      size={15}
      className="mt-0.5 shrink-0 text-brand-500 dark:text-brand-400"
      aria-hidden="true"
    />
    <p className="m-0! text-xs leading-relaxed text-brand-800 dark:text-brand-200">
      {message}
    </p>
  </div>
);
