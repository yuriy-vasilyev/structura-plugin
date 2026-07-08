/**
 * CaptionPackage — per-platform paste packages (YouTube Shorts / TikTok /
 * Instagram Reels) for the video Ready row on the Channels Activity page.
 *
 * Recreates the platform-captions design handoff
 * (marketing/design_handoff_platform_captions/README.md +
 * platform-captions/package.js) against the shipped wire contract:
 * `socialPackages` carries three fully-composed strings with `\n\n`
 * between blocks and no structured `hooks` field, so presentation (hook
 * emphasis, hashtag run, counters) is derived via `parseCaptionBlocks` /
 * `captionHook`. Copy payloads are always the RAW wire strings — never
 * the styled markup.
 *
 * Row layout: overline label + inline switcher on one line; below ~480px
 * container width it collapses to the stacked panel arrangement (switcher
 * stretches to three equal cells) via Tailwind 4 container queries —
 * container, not viewport, because the feed sits in wp-admin's
 * variable-width content column (sidebar folded/unfolded).
 */

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { __ } from "@wordpress/i18n";
import { Check, Copy, Film, Info, Music2, Play } from "lucide-react";
import { Tabs } from "@structura/ui";
import type { VideoSocialPackages } from "../types";
import {
  CAPTION_LIMITS,
  captionHook,
  parseCaptionBlocks,
  type CaptionBlockKind,
} from "../videoChannel";

type PlatformId = "yt" | "tt" | "ig";

interface CaptionPackageProps {
  packages: VideoSocialPackages;
}

export const CaptionPackage = ({ packages }: CaptionPackageProps) => {
  const [active, setActive] = useState<PlatformId>("yt");

  return (
    // The outer div only declares the size container: Tailwind's
    // `@max-[…]` variants respond to the nearest ANCESTOR container, so
    // the queried element can't be the container itself.
    <div className="@container mt-3 min-w-0">
      <div className="rounded-xl bg-neutral-50 p-3.5 ring-1 ring-neutral-200/60 @max-[480px]:p-3 dark:bg-white/[.03] dark:ring-white/[.06]">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
            {__("Suggested captions", "structura")}
          </span>
          <Tabs
            size="xs"
            value={active}
            onChange={(id) => setActive(id as PlatformId)}
            aria-label={__("Platform", "structura")}
            // Below ~480px the switcher takes the full row and the cells
            // share it equally — the stacked panel arrangement (handoff
            // board 04). Tabs' `stretch` prop is a JS toggle, so the
            // responsive flip is done with container-query overrides on
            // the track + its cells instead.
            className="@max-[480px]:w-full @max-[480px]:[&>button]:flex-1 @max-[480px]:[&>button]:justify-center"
            items={[
              // Platform short names are proper nouns (handoff
              // "Switcher"): untranslated by design so de/es/fr expansion
              // can't distort the switcher; full names ride the tooltip.
              {
                id: "yt",
                label: "Shorts",
                title: "YouTube Shorts",
                icon: <Play size={12} aria-hidden />,
              },
              {
                id: "tt",
                label: "TikTok",
                title: "TikTok",
                icon: <Music2 size={12} aria-hidden />,
              },
              {
                id: "ig",
                label: "Reels",
                title: "Instagram Reels",
                icon: <Film size={12} aria-hidden />,
              },
            ]}
          />
        </div>
        <div className="mt-3">
          {active === "yt" && <ShortsBody shorts={packages.shorts} />}
          {active === "tt" && <TikTokBody tiktok={packages.tiktok} />}
          {active === "ig" && <ReelsBody reels={packages.reels} />}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Per-platform tab bodies
// ---------------------------------------------------------------------------

function ShortsBody({ shorts }: { shorts: VideoSocialPackages["shorts"] }) {
  // "Copy all" = both upload fields labeled with the same translated
  // labels the UI shows (handoff package.js `text('yt_all')`) — YouTube's
  // upload form has two fields, so per-field copy stays primary.
  const copyAll = `${__("Title", "structura")}:\n${shorts.title}\n\n${__(
    "Description",
    "structura"
  )}:\n${shorts.description}`;

  return (
    <div className="space-y-3">
      <Field
        label={__("Title", "structura")}
        meta={<Counter count={shorts.title.length} max={CAPTION_LIMITS.shortsTitle} />}
        copyText={shorts.title}
        copyAria={__("Copy title", "structura")}
      >
        <span className="font-medium text-neutral-800 dark:text-neutral-100">{shorts.title}</span>
      </Field>
      <Field
        label={__("Description", "structura")}
        copyText={shorts.description}
        copyAria={__("Copy description", "structura")}
      >
        <CaptionValue raw={shorts.description} />
      </Field>
      <InfoRow>
        {__(
          "Links in Shorts descriptions aren’t clickable — the URL still helps search and viewers can copy it.",
          "structura"
        )}
      </InfoRow>
      <div className="flex justify-end border-t border-neutral-200/70 pt-2 dark:border-white/[.06]">
        <CopyButton
          text={copyAll}
          label={__("Copy all", "structura")}
          ariaLabel={__("Copy title and description", "structura")}
        />
      </div>
    </div>
  );
}

function TikTokBody({ tiktok }: { tiktok: VideoSocialPackages["tiktok"] }) {
  return (
    <div className="space-y-3">
      <Field
        label={__("Caption", "structura")}
        meta={<HookCounter hook={captionHook(tiktok.caption)} max={CAPTION_LIMITS.tiktokHook} />}
        copyText={tiktok.caption}
        copyAria={__("Copy caption", "structura")}
      >
        <CaptionValue raw={tiktok.caption} hookFirst />
      </Field>
      {/* A compliance instruction, not an error — neutral tone, persistent,
          not copyable (handoff "TikTok AI note"). */}
      <InfoRow>
        {__(
          "Enable TikTok’s ‘AI-generated content’ toggle when uploading — this video uses an AI voiceover.",
          "structura"
        )}
      </InfoRow>
    </div>
  );
}

function ReelsBody({ reels }: { reels: VideoSocialPackages["reels"] }) {
  return (
    <div className="space-y-3">
      <Field
        label={__("Caption", "structura")}
        meta={<HookCounter hook={captionHook(reels.caption)} max={CAPTION_LIMITS.reelsHook} />}
        copyText={reels.caption}
        copyAria={__("Copy caption", "structura")}
      >
        <CaptionValue raw={reels.caption} hookFirst />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * Labeled read-only field: header (label · advisory meta · copy) above the
 * value box. Long values wrap (`break-words`); the raw string's `\n`
 * breaks render via `whitespace-pre-line`, so hashtag runs wrap as whole
 * tokens and never truncate.
 */
function Field({
  label,
  meta,
  copyText,
  copyAria,
  children,
}: {
  label: string;
  meta?: ReactNode;
  copyText: string;
  copyAria: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-[11px] font-bold text-neutral-700 dark:text-neutral-200">
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {meta}
          <CopyButton text={copyText} label={__("Copy", "structura")} ariaLabel={copyAria} />
        </div>
      </div>
      <div className="mt-1 min-w-0 rounded-lg bg-white px-2.5 py-2 text-xs leading-relaxed break-words whitespace-pre-line text-neutral-600 ring-1 ring-neutral-200/80 dark:bg-neutral-900/60 dark:text-neutral-300 dark:ring-white/[.08]">
        {children}
      </div>
    </div>
  );
}

/** Block styling: the hook is the truncation window (its emphasis explains
    the counter); hashtag runs carry the brand tint from the legacy block. */
const BLOCK_CLASSES: Partial<Record<CaptionBlockKind, string>> = {
  hook: "font-medium text-neutral-800 dark:text-neutral-100",
  hashtags: "font-semibold text-brand-600 dark:text-brand-300",
};

/**
 * Render a composed caption's blocks. The parent value box is
 * `whitespace-pre-line`, so the `\n\n` separators (and single `\n` breaks
 * inside a block) render as real line breaks without any markup.
 */
function CaptionValue({ raw, hookFirst = false }: { raw: string; hookFirst?: boolean }) {
  return (
    <>
      {parseCaptionBlocks(raw, { hookFirst }).map((block, index) => (
        <Fragment key={index}>
          {index > 0 && "\n\n"}
          <span className={BLOCK_CLASSES[block.kind]}>{block.text}</span>
        </Fragment>
      ))}
    </>
  );
}

/**
 * Advisory character counter — amber over the limit, never blocking
 * (fields are read-only; the uploader decides).
 */
function Counter({ count, max }: { count: number; max: number }) {
  const over = count > max;
  return (
    <span
      title={over ? __("Over the recommended limit", "structura") : __("Within limit", "structura")}
      className={
        "font-mono text-[10px] tabular-nums " +
        (over
          ? "font-semibold text-amber-600 dark:text-amber-400"
          : "text-neutral-400 dark:text-neutral-500")
      }
    >
      {count}/{max}
    </span>
  );
}

/** "hook n/max" meta — the marker word plus the advisory counter. */
function HookCounter({ hook, max }: { hook: string; max: number }) {
  return (
    <>
      <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
        {__("hook", "structura")}
      </span>
      <Counter count={hook.length} max={max} />
    </>
  );
}

/**
 * Quiet info row — helper notes + the TikTok AI-toggle instruction.
 * Neutral tone on purpose: informational, never an error.
 */
function InfoRow({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="flex items-start gap-1.5">
      <Info
        size={13}
        aria-hidden
        className="mt-px shrink-0 text-neutral-400 dark:text-neutral-500"
      />
      {/* m-0! — WP admin global styles put margins on every <p>. */}
      <p className="m-0! min-w-0 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        {children}
      </p>
    </div>
  );
}

/**
 * Ghost copy button with the check-flip confirmation (~1.4s, emerald).
 * wp-admin has no toast pattern for copy affordances (the error boundary's
 * copy button is a plain flip too), so the flip is the whole confirmation.
 */
function CopyButton({
  text,
  label,
  ariaLabel,
}: {
  text: string;
  label: string;
  ariaLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const onCopy = () => {
    // Flip regardless of the promise so the affordance responds even where
    // the Clipboard API is restricted (matches the reference's behavior).
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={ariaLabel}
      className={
        "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold transition-all " +
        (copied
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-200")
      }
    >
      {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
      {copied ? __("Copied", "structura") : label}
    </button>
  );
}
