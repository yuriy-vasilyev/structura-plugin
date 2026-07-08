/**
 * "Coming soon" placeholder for steps 2–5 while their real UIs are
 * still in the W-B / W-C / W-D pipeline. Visible to paid-tier users
 * during the W-A skeleton phase; gets replaced step-by-step as
 * subsequent phases land.
 *
 * Free-tier users see {@link LockedStepCard} instead — they get the
 * upgrade surface, not the placeholder.
 *
 * The placeholder still works structurally: the user can Skip to
 * advance, and the wizard records the skip in the persistence layer
 * the same way it will for a real step. That keeps the W-A
 * skeleton's progress + persistence verifiable end-to-end before any
 * step content exists.
 */

import { __ } from "@wordpress/i18n";
import { Card } from "@structura/ui";
import { Hammer } from "lucide-react";

interface PlaceholderStepProps {
  title: string;
  /** One-line preview of what this step will do once shipped. */
  description: string;
  /** Slated implementation phase tag, e.g. "W-B". Surfaced verbatim. */
  phaseTag: string;
}

export const PlaceholderStep = ({
  title,
  description,
  phaseTag,
}: PlaceholderStepProps) => {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="m-0! text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {title}
        </h1>
        <p className="m-0! text-base text-neutral-600 dark:text-neutral-400">
          {description}
        </p>
      </header>

      <Card className="flex flex-col items-center gap-4 p-12">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500 dark:bg-amber-950/30">
          <Hammer size={18} />
        </span>
        <p className="m-0! text-sm font-medium text-neutral-900 dark:text-neutral-50">
          {__("This step is on its way", "structura")}
        </p>
        <p className="m-0! max-w-md text-center text-xs text-neutral-500 dark:text-neutral-400">
          {__(
            "Skip for now and we'll set you up with sensible defaults. You can revisit this step here or in the matching tab once it ships.",
            "structura",
          )}
        </p>
        <span className="rounded-md bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {phaseTag}
        </span>
      </Card>
    </div>
  );
};
