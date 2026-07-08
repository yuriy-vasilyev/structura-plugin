/**
 * DiscoverableChipList — the one "discover → suggest → add → confirm" picker,
 * shared by both surfaces (wp-admin SPA + customer portal).
 *
 * Consolidates the plugin's discovery picker and the portal's `ChipListEditor`
 * into a single controlled, presentational component so both surfaces speak one
 * design language (Discovery step, Site SEO settings, onboarding). The PARENT
 * owns the data (draft list, suggest + save mutations); this owns layout and
 * interaction.
 *
 * Layout (one section): confirmed chips (brand-tinted, removable, optional
 * metric `chipBadge`) → a dashed "suggested" sub-area (tap a chip to add,
 * optional "Add all" + discover button) → a compact inline `+ Add` input.
 * Domain items render a {@link Favicon}; text items render an optional leading
 * icon.
 *
 * Surface-neutral by design:
 * - No i18n inside — all visible strings come from props (the `labels` object
 *   carries English defaults; consumers pass `__()` / `t()` translations).
 * - No `!`-important margin resets — uses margin-free elements + flex `gap`,
 *   so it renders identically under wp-admin's WP-global cascade and the
 *   portal's preflight.
 *
 * Design guide: dark-mode-first, design tokens only; chips are real buttons
 * with focus rings + aria labels.
 */
import { useState, type ReactNode } from "react";
import { Loader2, Plus, RefreshCw, Sparkles, X, type LucideIcon } from "lucide-react";

import { cn } from "../utils";
import { Button } from "./Button";
import { Favicon } from "./Favicon";
import { InputField } from "./InputField";
import { Tooltip } from "./Tooltip";

/** One row of the picker. `value` is canonical (url/keyword); `label` displays. */
export interface DiscoverableChipItem {
  value: string;
  label: string;
  /** Optional hover reason (keyword/authority rationale). */
  tooltip?: string;
  /** Optional dimmed inline count (competitor shared-keyword overlap). */
  count?: number;
}

/** A per-confirmed-chip metric badge (e.g. keyword volume, authority tier). */
export interface DiscoverableChipBadge {
  label: string;
  /** Colour intent. `high`→emerald, `medium`→amber, `low`/`neutral`→gray. */
  tone: "high" | "medium" | "low" | "neutral";
}

/**
 * Visible strings the component renders itself. Each carries an English
 * default; consumers override with their own i18n (`__()` in the plugin,
 * `t()` in the portal) so nothing ships English-only.
 */
export interface DiscoverableChipLabels {
  /** Accessible name for a chip's remove button, given the chip label. */
  remove: (label: string) => string;
  /** "Add all" button in the suggested header. */
  addAll: string;
  /** Manual-add submit button. */
  add: string;
  /** Suggested-area eyebrow when `suggestedLabel` is not supplied. */
  suggested: string;
  /** Discover button when `discoverLabel` is not supplied. */
  discover: string;
  /** Manual-add field label/placeholder when `inputPlaceholder` is not supplied. */
  addItem: string;
}

const DEFAULT_LABELS: DiscoverableChipLabels = {
  remove: (label) => `Remove ${label}`,
  addAll: "Add all",
  add: "Add",
  suggested: "Suggested — tap to add",
  discover: "AI suggest",
  addItem: "Add an item",
};

export interface DiscoverableChipListProps {
  /** `domain` → favicon per chip; `text` → the `leadingIcon`. */
  kind: "domain" | "text";
  /** Leading icon for `text` kind (e.g. Tag for keywords, Link2 for authority). */
  leadingIcon?: LucideIcon;
  /** Confirmed items (rendered first, brand-tinted, removable). */
  added: DiscoverableChipItem[];
  /** Suggested-but-not-added items (already filtered by the parent). */
  suggested: DiscoverableChipItem[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  /** Renders "Add all" in the suggested header when provided. */
  onAddAll?: () => void;
  /** Renders a discover button (AI suggest / Re-discover) in the suggested header. */
  onDiscover?: () => void;
  discoverLabel?: string;
  discovering?: boolean;
  /** Primary-styled discover button + Sparkles icon (first-run discovery). */
  discoverPrimary?: boolean;
  /** Suggested-area eyebrow, e.g. "Auto-detected from your site". */
  suggestedLabel?: string;
  /** Optional banner rendered at the top of the suggested area (e.g. an AI-guess notice). */
  suggestedNotice?: ReactNode;
  /** Shown in place of the added zone when there are no confirmed items. */
  emptyText?: string;
  inputPlaceholder?: string;
  /**
   * Per-confirmed-chip metric badge keyed by the chip `value` (e.g. discovered
   * keyword volume, authority tier). Display-only — absent keys render a plain
   * chip.
   */
  chipBadges?: Record<string, DiscoverableChipBadge>;
  /**
   * Add a manually-typed value. Return `false` to KEEP the input (e.g. a
   * validation failure the parent surfaces via `addManualError`); any other
   * return clears it. Optional — omit together with `hideInput` for a
   * suggestions-only sub-list that has no manual-add field.
   */
  onAddManual?: (raw: string) => void | boolean;
  addManualError?: string | null;
  /** Caps/locks all add affordances (e.g. at the list cap). */
  disabled?: boolean;
  /** Accessible name for the confirmed-items list. */
  ariaLabel?: string;
  /**
   * Suppress the manual-add input. For a suggestions-only sub-list that
   * shares another instance's input (e.g. a secondary keyword bucket
   * rendered under the primary picker) — avoids a duplicate field.
   */
  hideInput?: boolean;
  /** Translated strings; merged over English defaults. */
  labels?: Partial<DiscoverableChipLabels>;
}

/** "39125" → "39k" so a chip stays compact; small counts render verbatim. */
function compactCount(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

const BADGE_TONE: Record<DiscoverableChipBadge["tone"], string> = {
  high: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  low: "bg-neutral-200/70 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400",
  neutral: "bg-neutral-200/70 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400",
};

export function DiscoverableChipList({
  kind,
  leadingIcon: LeadingIcon,
  added,
  suggested,
  onAdd,
  onRemove,
  onAddAll,
  onDiscover,
  discoverLabel,
  discovering = false,
  discoverPrimary = false,
  suggestedLabel,
  suggestedNotice,
  emptyText,
  inputPlaceholder,
  chipBadges,
  onAddManual,
  addManualError,
  disabled = false,
  ariaLabel,
  hideInput = false,
  labels: labelOverrides,
}: DiscoverableChipListProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const [input, setInput] = useState("");

  const submit = () => {
    const v = input.trim();
    if (!v || disabled || !onAddManual) return;
    // Parent returns false to reject (keep the text so the user can fix it).
    if (onAddManual(v) !== false) setInput("");
  };

  const leading = (item: DiscoverableChipItem) =>
    kind === "domain" ? (
      <Favicon domain={item.label} />
    ) : LeadingIcon ? (
      <LeadingIcon size={12} className="shrink-0" aria-hidden="true" />
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Confirmed items. */}
      {added.length > 0 ? (
        <ul aria-label={ariaLabel} className="flex flex-wrap gap-2">
          {added.map((item) => {
            const badge = chipBadges?.[item.value];
            return (
              <li
                key={item.value}
                className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-sm text-brand-800 dark:border-brand-900/40 dark:bg-brand-950/30 dark:text-brand-200"
              >
                {leading(item)}
                <span className="truncate">{item.label}</span>
                {badge ? (
                  <span
                    className={cn(
                      "shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase",
                      BADGE_TONE[badge.tone]
                    )}
                  >
                    {badge.label}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onRemove(item.value)}
                  aria-label={labels.remove(item.label)}
                  className="ml-0.5 shrink-0 cursor-pointer rounded text-brand-500 transition-colors hover:text-red-600 dark:text-brand-400"
                >
                  <X size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : emptyText ? (
        <div className="rounded-md border border-dashed border-neutral-200 px-4 py-6 text-center dark:border-neutral-700">
          <span className="block text-sm text-neutral-500 dark:text-neutral-400">
            {emptyText}
          </span>
        </div>
      ) : null}

      {/* Suggested items + discover. */}
      {suggested.length > 0 || onDiscover ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
          {suggestedNotice}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              {suggestedLabel ?? labels.suggested}
            </span>
            <div className="flex items-center gap-1">
              {onAddAll && suggested.length > 0 ? (
                <Button
                  variant="transparent"
                  size="sm"
                  onClick={onAddAll}
                  disabled={disabled}
                >
                  <Plus size={12} className="mr-1" />
                  {labels.addAll}
                </Button>
              ) : null}
              {onDiscover ? (
                <Button
                  variant={discoverPrimary ? "primary" : "transparent"}
                  size="sm"
                  onClick={onDiscover}
                  disabled={discovering}
                >
                  {discovering ? (
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                  ) : discoverPrimary ? (
                    <Sparkles size={14} className="mr-1.5" />
                  ) : (
                    <RefreshCw size={14} className="mr-1.5" />
                  )}
                  {discoverLabel ?? labels.discover}
                </Button>
              ) : null}
            </div>
          </div>
          {suggested.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {suggested.map((item) => {
                const chip = (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      if (!disabled) onAdd(item.value);
                    }}
                    disabled={disabled}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-700 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-brand-950/30"
                  >
                    {leading(item)}
                    <span>{item.label}</span>
                    {typeof item.count === "number" ? (
                      <span className="text-neutral-400 dark:text-neutral-500">
                        · {compactCount(item.count)}
                      </span>
                    ) : null}
                    <Plus size={12} className="ml-0.5 shrink-0 text-neutral-400" />
                  </button>
                );
                return item.tooltip ? (
                  <Tooltip key={item.value} title={item.tooltip}>
                    {chip}
                  </Tooltip>
                ) : (
                  chip
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Compact manual add. */}
      {hideInput ? null : (
        <InputField
          label={inputPlaceholder ?? labels.addItem}
          hiddenLabel
          size="sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={inputPlaceholder}
          disabled={disabled}
          error={addManualError ?? undefined}
          rightAdornment={
            <Button
              variant="transparent"
              size="sm"
              onClick={submit}
              disabled={!input.trim() || disabled}
            >
              <Plus size={14} className="mr-1" />
              {labels.add}
            </Button>
          }
        />
      )}
    </div>
  );
}
