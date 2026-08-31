import type { ReactNode } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { Button, Dialog, getProviderLogo } from "@structura/ui";
import {
  FilePenLine,
  Globe,
  Image as ImageIcon,
  Languages,
  Paperclip,
  PenLine,
  RotateCcw,
  Target,
  UserRound,
  X,
} from "lucide-react";

/**
 * "Run again" confirmation modal.
 *
 * Design handoff: `marketing/design_handoff_run_again_modal/`. Re-running a
 * finished single-post generation creates a NEW post and spends a generation
 * from the plan, so this guards the action: reassure what happens, then let the
 * owner verify the settings — above all Draft vs Publish — before committing.
 *
 * Provider rows show the brand logo + "Provider · Model" (the caller resolves
 * the label from the now-landed @structura/model-catalog); this component stays
 * presentational and just renders what it's handed.
 */

const OVERLINE =
  "text-[10px] font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500";

export interface RunAgainConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Drives the spinner, disabled controls, and Esc suppression. */
  submitting?: boolean;
  /** The only guaranteed field — can be long; clamped to two lines. */
  topic: string;
  /** Requested post status. Anything other than "publish" reads as a draft. */
  postStatus: "publish" | "draft" | "pending";
  /**
   * Resolved provider rows (text/image). `value` is the display string, e.g.
   * "OpenAI · GPT-5.2"; `providerId` drives the brand logo. Caller-resolved so
   * the modal stays free of catalog lookups.
   */
  providers?: Array<{
    key: string;
    role: "text" | "image";
    providerId: string;
    value: string;
  }>;
  personaName?: string;
  language?: string;
  focusKeyphrase?: string;
  /**
   * File names of the research attachments the original run was grounded
   * in (from the run's `inputSnapshot.researchAttachments`). Rendered as a
   * "{first} +{n} more" summary row. Absent on legacy runs and runs without
   * attachments. No expired-file detection — the cloud skips missing docs
   * gracefully, so the replay never blocks on them.
   */
  researchAttachmentNames?: string[];
}

export const RunAgainConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  submitting = false,
  topic,
  postStatus,
  providers,
  personaName,
  language,
  focusKeyphrase,
  researchAttachmentNames,
}: RunAgainConfirmDialogProps) => {
  const isPublish = postStatus === "publish";

  // One list, in the handoff's reading order: providers, then persona /
  // language / focus keyphrase. Provider rows carry a `providerId` → brand logo.
  const rows = [
    ...(providers ?? []).map((p) => ({
      key: p.key,
      icon: p.role === "text" ? PenLine : ImageIcon,
      label:
        p.role === "text" ? __("Text provider", "structura") : __("Image provider", "structura"),
      value: p.value,
      providerId: p.providerId,
    })),
    personaName && {
      key: "persona",
      icon: UserRound,
      label: __("Persona", "structura"),
      value: personaName,
    },
    language && {
      key: "language",
      icon: Languages,
      label: __("Language", "structura"),
      value: language,
    },
    focusKeyphrase && {
      key: "keyphrase",
      icon: Target,
      label: __("Focus keyphrase", "structura"),
      value: focusKeyphrase,
    },
    !!researchAttachmentNames?.length && {
      key: "research",
      icon: Paperclip,
      label: __("Research files", "structura"),
      // Handoff `echo.more`: first file name + "+{n} more" for the rest.
      value:
        researchAttachmentNames.length === 1
          ? researchAttachmentNames[0]
          : sprintf(
              /* translators: 1: first file name, 2: count of additional files */
              __("%1$s +%2$d more", "structura"),
              researchAttachmentNames[0],
              researchAttachmentNames.length - 1
            ),
    },
  ].filter(Boolean) as Array<{
    key: string;
    icon: typeof UserRound;
    label: ReactNode;
    value: string;
    providerId?: string;
  }>;

  return (
    // Esc / overlay click close — suppressed while submitting so a kickoff
    // can't be interrupted mid-request.
    <Dialog.Root open={open} onClose={submitting ? () => {} : onClose} size="md">
      <Dialog.Content className="overflow-visible!">
        {/* Indeterminate progress pinned to the panel's top edge while the new
            run is being kicked off. */}
        {submitting && (
          <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-2xl">
            <div className="bg-brand-500 h-full w-1/3 animate-pulse motion-reduce:animate-none" />
          </div>
        )}

        {/* Close ✕ */}
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          aria-label={__("Close", "structura")}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-neutral-200"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3.5 pr-8">
          <span className="bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300 flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
            <RotateCcw size={20} />
          </span>
          <div className="min-w-0">
            <Dialog.Title>{__("Run again?", "structura")}</Dialog.Title>
            <Dialog.Description className="mt-1.5! text-[13px] leading-relaxed">
              {/* "new post" emphasized per the handoff. */}
              {__("This creates a ", "structura")}
              <span className="font-semibold text-neutral-600 dark:text-neutral-300">
                {__("new post", "structura")}
              </span>
              {__(
                " using the same settings below. It uses one generation from your plan.",
                "structura"
              )}
            </Dialog.Description>
          </div>
        </div>

        <Dialog.Body className="mt-5! space-y-4">
          {/* Topic */}
          <div className="rounded-xl bg-neutral-50 p-3.5 ring-1 ring-neutral-200/70 ring-inset dark:bg-white/[.03] dark:ring-white/[.06]">
            <p className={`mt-0! mb-1.5! ${OVERLINE}`}>{__("Topic", "structura")}</p>
            <p
              className="m-0! text-sm leading-relaxed font-medium text-neutral-800 dark:text-neutral-100"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {topic}
            </p>
          </div>

          {/* Post status — the load-bearing field. Draft vs Publish is encoded
              by icon + title + badge word as well as tone (WCAG 1.4.1). */}
          <div>
            <p className={`mt-0! mb-1.5! ${OVERLINE}`}>{__("Post status", "structura")}</p>
            <div
              className={
                isPublish
                  ? "flex items-center gap-3.5 rounded-xl border border-amber-300/70 bg-amber-50 p-3.5 dark:border-amber-500/30 dark:bg-amber-950/30"
                  : "flex items-center gap-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 p-3.5 dark:border-neutral-700 dark:bg-white/[.03]"
              }
            >
              <span
                className={
                  isPublish
                    ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                    : "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-neutral-500 ring-1 ring-neutral-200 dark:bg-white/5 dark:text-neutral-300 dark:ring-white/10"
                }
              >
                {isPublish ? <Globe size={20} /> : <FilePenLine size={20} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0! text-sm font-bold text-neutral-900 dark:text-white">
                  {isPublish
                    ? __("Publishes live immediately", "structura")
                    : __("Saves as a draft", "structura")}
                </p>
                <p className="mt-0.5!text-xs mb-0! leading-snug text-neutral-500 dark:text-neutral-400">
                  {isPublish
                    ? __("Goes public the moment it's generated.", "structura")
                    : __("Stays private until you publish it yourself.", "structura")}
                </p>
              </div>
              <span
                className={
                  isPublish
                    ? "inline-flex items-center gap-1 rounded-full bg-amber-200 px-2.5 py-1 text-[10px] leading-none font-bold tracking-wide text-amber-800 uppercase dark:bg-amber-500/25 dark:text-amber-200"
                    : "inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2.5 py-1 text-[10px] leading-none font-bold tracking-wide text-neutral-600 uppercase dark:bg-white/10 dark:text-neutral-300"
                }
              >
                {isPublish ? <Globe size={11} /> : <FilePenLine size={11} />}
                {isPublish ? __("Publish", "structura") : __("Draft", "structura")}
              </span>
            </div>
          </div>

          {/* Settings — render only present fields; omit the block entirely when
              none are known (older runs). */}
          {rows.length > 0 && (
            <dl className="m-0! divide-y divide-neutral-100 rounded-xl border border-neutral-200 px-3.5 dark:divide-neutral-800 dark:border-neutral-800">
              {rows.map(({ key, icon: Icon, label, value, providerId }) => {
                const Logo = providerId ? getProviderLogo(providerId) : null;
                return (
                  <div key={key} className="flex items-center justify-between gap-4 py-2.5">
                    <dt className="m-0! flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                      <Icon size={14} className="text-neutral-400 dark:text-neutral-500" />
                      {label}
                    </dt>
                    <dd className="m-0! flex min-w-0 items-center justify-end gap-1.5 text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">
                      {Logo && <Logo size={15} className="shrink-0" />}
                      <span className="truncate">{value}</span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </Dialog.Body>

        <Dialog.Footer>
          {/* Initial focus = Cancel (the non-spending default), guarding
              against accidental spend. */}
          <Button variant="secondary" onClick={onClose} disabled={submitting} autoFocus>
            {__("Cancel", "structura")}
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={submitting}>
            {!submitting && <RotateCcw size={16} className="mr-2" />}
            {submitting ? __("Starting…", "structura") : __("Run again", "structura")}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};
