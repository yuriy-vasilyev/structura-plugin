/**
 * "Preview with my colours" (visual-signatures handoff §3.6; spec §8): one
 * sample image of the unsaved choice in the palette. A row until first used;
 * rendering, done (concept under the image), failed (the last image stays),
 * locked on free and none, and out of images on a managed plan.
 */
import { useEffect, useRef, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { ArrowUpRight, CircleAlert, ImageIcon, Lock } from "lucide-react";
import { Badge, Button, ProgressBar } from "@structura/ui";

import {
  isPlanGatedError,
  usePreviewVisualSignatureMutation,
  type PreviewVisualSignatureInput,
  type PreviewVisualSignatureResult,
} from "../api/useVisualPresets";

/** Props for {@link SignaturePreview}. */
export interface SignaturePreviewProps {
  /** Id for the section heading. */
  headingId: string;
  /** Free and none: the run button is disabled behind "Paid plans" and an upgrade link. */
  locked: boolean;
  /** Pricing page link for the locked state. */
  upgradeHref: string;
  /** When a managed plan's images for the month are used up: the reset date, for the line under the button. */
  imagesResetOn: string | null;
  /**
   * The request for the current unsaved choice, or null when it can't be
   * previewed yet (an incomplete custom draft, which the caller flags, or an
   * empty free prompt).
   */
  buildRequest: () => PreviewVisualSignatureInput | null;
}

type PreviewStatus = "idle" | "rendering" | "ok" | "failed";

/** SignaturePreview: renders the unsaved choice on demand and ignores answers to older requests. */
export function SignaturePreview({
  headingId,
  locked,
  upgradeHref,
  imagesResetOn,
  buildRequest,
}: SignaturePreviewProps) {
  const preview = usePreviewVisualSignatureMutation();
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [result, setResult] = useState<PreviewVisualSignatureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped per run and on unmount: an answer for an older run is dropped.
  const latestRun = useRef(0);
  useEffect(() => () => void (latestRun.current += 1), []);

  const run = async () => {
    const input = buildRequest();
    if (!input) return;
    const runId = ++latestRun.current;
    setStatus("rendering");
    setError(null);
    try {
      const response = await preview.mutateAsync(input);
      if (runId !== latestRun.current) return;
      setResult({ imageUrl: response.imageUrl, concept: response.concept });
      setStatus("ok");
    } catch (err) {
      if (runId !== latestRun.current) return;
      setStatus("failed");
      setError(
        isPlanGatedError(err)
          ? __("That style comes with paid plans.", "structura")
          : result
            ? __(
                "The new preview didn’t render, so your last one is still shown. Try again in a moment.",
                "structura"
              )
            : __("The preview didn’t render. Try again in a moment.", "structura")
      );
    }
  };

  const rendering = status === "rendering";
  const cost = <span className="font-medium opacity-80">{__("· 1 image", "structura")}</span>;
  const runLabel = rendering
    ? __("Rendering", "structura")
    : status === "failed"
      ? __("Try again", "structura")
      : result
        ? __("Preview again", "structura")
        : __("Preview with my colours", "structura");

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3
          id={headingId}
          className="m-0! text-base font-bold tracking-tight text-neutral-900 dark:text-white"
        >
          {__("Preview", "structura")}
        </h3>
        <p className="m-0! max-w-[62ch] text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {__(
            "See one sample image in this style with your colours before you save. Each preview counts as one image.",
            "structura"
          )}
        </p>
      </div>

      {(status !== "idle" || result) && (
        <figure className="m-0! flex max-w-[560px] flex-col gap-2">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-neutral-50 ring-1 ring-neutral-200 ring-inset dark:bg-neutral-800/50 dark:ring-neutral-700">
            {rendering ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <ImageIcon
                  size={28}
                  strokeWidth={1.5}
                  className="text-neutral-400"
                  aria-hidden="true"
                />
                <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
                  {__("Rendering your preview", "structura")}
                </span>
                <ProgressBar
                  aria-label={__("Rendering your preview", "structura")}
                  className="absolute inset-x-4 bottom-4"
                />
              </div>
            ) : result ? (
              <img
                src={result.imageUrl}
                alt={result.concept}
                className="block h-full w-full object-cover"
              />
            ) : null}
          </div>
          {rendering && (
            <p role="status" className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
              {__(
                "This usually takes about 20 seconds. You can keep editing meanwhile.",
                "structura"
              )}
            </p>
          )}
          {!rendering && result && (
            <figcaption className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-neutral-900 dark:text-white">
                {__("Concept", "structura")}
              </span>
              <span className="text-[13px] text-neutral-700 dark:text-neutral-300">
                {result.concept}
              </span>
            </figcaption>
          )}
        </figure>
      )}

      {status === "failed" && error && (
        <div
          role="alert"
          className="flex max-w-[560px] items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
        >
          <CircleAlert
            size={16}
            className="mt-px shrink-0 text-red-600 dark:text-red-400"
            aria-hidden="true"
          />
          <span>{error}</span>
        </div>
      )}

      {locked ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled>
            <Lock aria-hidden="true" />
            {__("Preview with my colours", "structura")}
          </Button>
          <Badge intent="default" variant="outline" size="xs">
            {__("Paid plans", "structura")}
          </Badge>
          <a
            href={upgradeHref}
            target="_blank"
            rel="noreferrer"
            className="text-brand-600! dark:text-brand-400! inline-flex min-h-6 items-center gap-1 rounded-sm text-[13px] font-bold no-underline! hover:underline! max-sm:min-h-11"
          >
            {__("Upgrade plan", "structura")}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <Button
            variant="secondary"
            onClick={run}
            loading={rendering}
            disabled={imagesResetOn !== null}
            className="whitespace-nowrap"
          >
            <ImageIcon aria-hidden="true" />
            {runLabel}
            {!rendering && cost}
          </Button>
          {imagesResetOn !== null && (
            <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
              {sprintf(
                /* translators: %s: the date the monthly image allowance resets, e.g. "1 December" */
                __("No images left this month. Your allowance resets on %s.", "structura"),
                imagesResetOn
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
