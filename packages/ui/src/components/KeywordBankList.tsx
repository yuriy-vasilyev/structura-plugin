/**
 * KeywordBankList — the ranked keyword bank on the campaign wizard's Discovery
 * step, shared by the customer portal and the wp-admin plugin SPA.
 *
 * Composes {@link KeywordRow}: caption row ("Publish order · best winnable
 * volume first" + the resolved mode), the winnable rows, collapse-to-top-15
 * with a fade + floating pill, the pillars group (keywords above the KD
 * ceiling, published last), the "N long-tail variants ready" line, and the
 * a11y plumbing — `aria-expanded`/`aria-controls`, remove-focus handoff,
 * `aria-live` for move-to-top.
 *
 * Design handoff: `marketing/design_handoff_keyword_bank/keyword-bank-spec.md`
 * §3 (collapse), §4 (pillars), §5 (states), §7 (a11y).
 *
 * The PARENT owns the data (the ordered bank + metrics, the add input, the
 * discovery mutation); this owns layout and interaction. Order in = publish
 * order out: the component never re-sorts, it only derives the pillar split.
 * Reset the collapsed state after a re-discovery by changing `key`.
 *
 * Surface-neutral: no i18n inside (`labels` carry English defaults), no
 * `!`-important margin resets, tokens only, light and dark co-equal.
 */
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronDown, ChevronUp, ListTree, Mountain } from "lucide-react";

import { cn } from "../utils";
import {
  DEFAULT_KEYWORD_ROW_LABELS,
  KeywordRow,
  type KeywordProvenance,
  type KeywordRowLabels,
  type KeywordRowMetrics,
} from "./KeywordRow";
import { deriveKdState } from "./MetricChip";
import { Tooltip } from "./Tooltip";

/** One bank entry, in publish order. */
export interface KeywordBankItem {
  keyword: string;
  source: KeywordProvenance;
  metrics?: KeywordRowMetrics;
  variantCount?: number;
  /** Explicit pillar override; derived from `kd > kdCeiling` when absent. */
  pillar?: boolean;
  /** Just added, metrics still resolving. */
  pending?: boolean;
}

/** List-level strings (row strings live in {@link KeywordRowLabels}). */
export interface KeywordBankListLabels {
  /** `<ul aria-label>` for the main list. */
  listAria: string;
  /** `<ul aria-label>` for the pillar list. */
  pillarsAria: string;
  /** Overline caption over the list. */
  publishOrder: string;
  /** Caption right slot on AI-estimated banks. */
  orderEstimated: string;
  showAll: (total: number) => string;
  showTop: (n: number) => string;
  /** "27 more · 3 pillars publish last" — `pillars` may be 0. */
  hiddenCaption: (hidden: number, pillars: number) => string;
  pillarsTitle: string;
  pillarsBody: string;
  variantsLine: (total: number) => string;
  /** `aria-live` announcement after move-to-top. */
  movedToTop: string;
}

export const DEFAULT_KEYWORD_BANK_LABELS: KeywordBankListLabels = {
  listAria: "Keyword bank, in publish order",
  pillarsAria: "Pillar keywords",
  publishOrder: "Publish order · best winnable volume first",
  orderEstimated: "order estimated",
  showAll: (total) => `Show all ${total} keywords`,
  showTop: (n) => `Show top ${n} only`,
  hiddenCaption: (hidden, pillars) =>
    pillars > 0
      ? `${hidden} more · ${pillars} pillar${pillars === 1 ? "" : "s"} publish last`
      : `${hidden} more`,
  pillarsTitle: "Pillars",
  pillarsBody: "Long-term targets above your difficulty ceiling — published after the winnable ones.",
  variantsLine: (total) =>
    `${total} long-tail variants ready — each post gets its own keyphrase, so seeds can safely repeat.`,
  movedToTop: "Moved to position 1",
};

/** Rows shown before the fade + "Show all" pill (spec §3). */
export const KEYWORD_BANK_COLLAPSE_AT = 15;

/** Entrance stagger per row, and the cap so long lists don't crawl in. */
const STAGGER_MS = 22;
const STAGGER_CAP_MS = 440;

export interface KeywordBankListProps {
  /** The bank in publish order. */
  items: KeywordBankItem[];
  /** Resolved KD ceiling (40 / 65) or `null` for authority mode. */
  kdCeiling?: number | null;
  /** AI-estimated bank (`meta.path === "legacy"`): rows degrade, no pillars. */
  estimated?: boolean;
  /** Caption right slot: the resolved mode, e.g. "Balanced · KD ≤ 65". */
  modeCaption?: ReactNode;
  /** Tooltip explaining the resolved mode (also mirrored to `aria-label`). */
  modeTooltip?: string;
  onRemove: (keyword: string) => void;
  /** Absent → rows render no move-to-top action. */
  onMoveToTop?: (keyword: string) => void;
  /**
   * The surface's Add input — receives focus when the last row is removed
   * (spec §7). Optional; without it focus just returns to the document.
   */
  addInputRef?: RefObject<HTMLInputElement | null>;
  collapseAt?: number;
  /** Number-format locale for the volume column. */
  locale?: string;
  labels?: Partial<KeywordBankListLabels>;
  rowLabels?: Partial<KeywordRowLabels>;
  className?: string;
}

export function KeywordBankList({
  items,
  kdCeiling = null,
  estimated = false,
  modeCaption,
  modeTooltip,
  onRemove,
  onMoveToTop,
  addInputRef,
  collapseAt = KEYWORD_BANK_COLLAPSE_AT,
  locale,
  labels: labelOverrides,
  rowLabels: rowLabelOverrides,
  className,
}: KeywordBankListProps) {
  const labels: KeywordBankListLabels = { ...DEFAULT_KEYWORD_BANK_LABELS, ...labelOverrides };
  const rowLabels: KeywordRowLabels = { ...DEFAULT_KEYWORD_ROW_LABELS, ...rowLabelOverrides };
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  // Index (in the flat publish order) whose remove button should receive
  // focus after the parent commits a removal — see `handleRemove`.
  const pendingFocusIndex = useRef<number | null>(null);

  // Pillar split. Estimated banks have no KD, hence no pillars (spec §5);
  // otherwise a row is a pillar when it says so or its KD clears the ceiling.
  const { regular, pillars } = useMemo(() => {
    const regular: KeywordBankItem[] = [];
    const pillars: KeywordBankItem[] = [];
    for (const item of items) {
      const isPillar =
        !estimated &&
        !item.pending &&
        (item.pillar ?? deriveKdState(item.metrics?.kd, kdCeiling) === "pillar");
      (isPillar ? pillars : regular).push(item);
    }
    return { regular, pillars };
  }, [items, estimated, kdCeiling]);

  const total = regular.length + pillars.length;
  const collapsible = total > collapseAt;
  const collapsed = collapsible && !expanded;
  const shown = collapsed ? regular.slice(0, collapseAt) : regular;
  const hidden = total - shown.length;
  const variantsTotal = estimated
    ? 0
    : items.reduce((sum, item) => sum + (item.variantCount ?? 0), 0);

  // Remove-focus handoff (spec §7): focus the NEXT row's remove button, or
  // the previous one when the last row went, or the Add input when the list
  // is empty. Runs after the parent's re-render removed the row.
  const handleRemove = (keyword: string, flatIndex: number) => {
    pendingFocusIndex.current = flatIndex;
    onRemove(keyword);
  };
  useEffect(() => {
    const idx = pendingFocusIndex.current;
    if (idx === null) return;
    pendingFocusIndex.current = null;
    const buttons = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-kb-remove]") ?? []
    );
    if (buttons.length === 0) {
      addInputRef?.current?.focus();
      return;
    }
    buttons[Math.min(idx, buttons.length - 1)]?.focus();
  }, [items, addInputRef]);

  const handleMoveToTop = (keyword: string) => {
    onMoveToTop?.(keyword);
    // Re-set even when unchanged so repeat moves re-announce.
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(labels.movedToTop));
  };

  const renderRow = (item: KeywordBankItem, position: number, flatIndex: number, isPillar: boolean) => (
    <KeywordRow
      key={item.keyword}
      position={position}
      keyword={item.keyword}
      metrics={item.metrics}
      kdCeiling={kdCeiling}
      source={item.source}
      variantCount={item.variantCount}
      pillar={isPillar}
      estimated={estimated}
      pending={item.pending}
      onRemove={() => handleRemove(item.keyword, flatIndex)}
      onMoveToTop={onMoveToTop && !isPillar ? () => handleMoveToTop(item.keyword) : undefined}
      locale={locale}
      animationDelayMs={Math.min(flatIndex * STAGGER_MS, STAGGER_CAP_MS)}
      labels={rowLabels}
    />
  );

  return (
    <div ref={rootRef} className={cn("flex flex-col", className)} data-keyword-bank="">
      {/* Caption row (spec §5). */}
      <div className="flex items-center justify-between gap-3 px-2 pb-1.5">
        <span className="text-[10px] font-black uppercase leading-none tracking-widest text-neutral-400 dark:text-neutral-500">
          {labels.publishOrder}
        </span>
        {estimated ? (
          <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
            {labels.orderEstimated}
          </span>
        ) : modeCaption ? (
          modeTooltip ? (
            <Tooltip title={modeTooltip} position="top-end">
              <span
                tabIndex={0}
                aria-label={modeTooltip}
                data-mode-caption=""
                className="rounded-sm font-mono text-[10px] text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-neutral-500"
              >
                {modeCaption}
              </span>
            </Tooltip>
          ) : (
            <span data-mode-caption="" className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
              {modeCaption}
            </span>
          )
        ) : null}
      </div>

      {/* The list. `@container` scopes the row's ≤600px wrap to THIS width. */}
      <div className="relative">
        <ul
          id={listId}
          aria-label={labels.listAria}
          className="@container flex flex-col"
          data-collapsed={collapsed ? "" : undefined}
        >
          {shown.map((item, i) => renderRow(item, i + 1, i, false))}
        </ul>
        {collapsed ? (
          // 88px gradient to the surface colour under the 15th row (spec §3).
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[88px] bg-gradient-to-b from-transparent to-white to-[82%] dark:to-neutral-900"
          />
        ) : null}
      </div>

      {/* Pillars group — expanded state only (spec §4). Positions continue. */}
      {!collapsed && pillars.length > 0 ? (
        <div
          data-pillars=""
          className="mt-3 rounded-xl bg-purple-50/60 p-2 ring-1 ring-purple-100 dark:bg-purple-500/[0.06] dark:ring-purple-500/15"
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-2 pb-1 pt-1.5">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase leading-none tracking-widest text-purple-600 dark:text-purple-400">
              <Mountain size={12} aria-hidden="true" />
              {labels.pillarsTitle}
            </span>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {labels.pillarsBody}
            </span>
          </div>
          <ul aria-label={labels.pillarsAria} className="@container flex flex-col">
            {pillars.map((item, j) =>
              renderRow(item, regular.length + j + 1, regular.length + j, true)
            )}
          </ul>
        </div>
      ) : null}

      {/* ONE toggle element in ONE tree position, restyled per state, so focus
          survives the collapsed ↔ expanded re-render (spec §3). */}
      {collapsible ? (
        <div
          className={cn(
            "flex flex-col items-center gap-1",
            collapsed ? "relative z-10 -mt-2" : "mt-3"
          )}
        >
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={!collapsed}
            aria-controls={listId}
            data-kb-toggle=""
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full border-0 px-4 py-1.5 text-xs font-bold transition-all duration-fast ease-out hover:scale-[1.02] active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]",
              collapsed
                ? // Floating pill, elevation 2 (design guide §4.2).
                  "bg-white text-neutral-700 shadow-floating ring-1 ring-neutral-200 hover:text-brand-700 hover:ring-brand-300 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-white/[0.06] dark:hover:text-brand-300"
                : "bg-transparent text-neutral-500 hover:text-brand-600 dark:text-neutral-400 dark:hover:text-brand-400"
            )}
          >
            {collapsed ? (
              <ChevronDown size={14} aria-hidden="true" />
            ) : (
              <ChevronUp size={14} aria-hidden="true" />
            )}
            {collapsed ? labels.showAll(total) : labels.showTop(collapseAt)}
          </button>
          {collapsed ? (
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
              {labels.hiddenCaption(hidden, pillars.length)}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Variants line — live banks only (spec §5). */}
      {variantsTotal > 0 ? (
        // A <div>, not a <p>: wp-admin's unlayered `p { margin: 1em 0 }`
        // beats Tailwind's layered utilities, so a <p> here would need a
        // `!` reset the portal forbids.
        <div
          data-variants-line=""
          className="mt-3 flex items-start gap-2 px-2 text-xs leading-relaxed text-neutral-400 dark:text-neutral-500"
        >
          <ListTree size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{labels.variantsLine(variantsTotal)}</span>
        </div>
      ) : null}

      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
