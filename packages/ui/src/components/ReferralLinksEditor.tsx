/**
 * ReferralLinksEditor — the one editor for client referral / partner links,
 * shared by both surfaces (wp-admin SPA + customer portal).
 *
 * A client lists tracking URLs (verbatim — query params preserved) plus a label
 * and optional relevance keywords; the cloud weaves at most ONE relevant link
 * into each generated post, using AI-authored anchor text unless the client
 * pins an exact anchor. Same component in two data bindings: a site-level list
 * that seeds every campaign, and a per-campaign override — the only difference
 * is one helper sentence in the header (`binding`).
 *
 * Controlled + presentational (the {@link DiscoverableChipList} contract): the
 * PARENT owns the list and save mutations; this owns layout, per-field blur
 * validation, and the anchor-override disclosure. Surface-neutral — no i18n
 * inside (every visible string comes from `labels`, English defaults overridden
 * with `__()` / `t()`), no `!`-margin resets, dark + light co-equal.
 *
 * Design: marketing/design_handoff_referral_links (high-fidelity handoff).
 */
import { useRef, useState, type KeyboardEvent } from "react";
import { Globe, Info, Link, Plus, X } from "lucide-react";

import { cn } from "../utils";
import { Button } from "./Button";
import { Favicon } from "./Favicon";
import { InputField } from "./InputField";

/**
 * One referral link. Matches the cloud `ReferralLink` wire shape so the value
 * round-trips straight to persistence with no mapping.
 */
export interface ReferralLinkValue {
  /** Verbatim destination URL — tracking params preserved, never rewritten. */
  url: string;
  /** Product/brand name. Seeds the anchor text and per-post relevance. */
  label: string;
  /** Topics this link is relevant to; drives which posts it appears in. */
  relevanceKeywords?: string[];
  /** Exact anchor override; when absent the AI writes a natural anchor. */
  anchorText?: string;
}

/**
 * Visible strings the editor renders itself. Each carries an English default;
 * consumers override with their own i18n so nothing ships English-only. Follows
 * the {@link DiscoverableChipLabels} pattern exactly.
 */
export interface ReferralLinksEditorLabels {
  sectionTitle: string;
  optionalTag: string;
  /** Header helper for the site-level binding. */
  siteHelper: string;
  /** Header helper for the campaign-level binding. */
  campaignHelper: string;
  labelLabel: string;
  labelPlaceholder: string;
  urlLabel: string;
  urlPlaceholder: string;
  keywordsLabel: string;
  keywordsOptionalTag: string;
  keywordsPlaceholder: string;
  /** Accessible name for the keyword text input. */
  keywordsAddAria: string;
  anchorToggle: string;
  anchorToggleQualifier: string;
  anchorLabel: string;
  anchorPlaceholder: string;
  anchorHint: string;
  anchorClear: string;
  addLink: string;
  emptyText: string;
  /** FTC nudge, split so the middle segment can be a link to the disclosure toggle. */
  ftcBefore: string;
  ftcLink: string;
  ftcAfter: string;
  /** Accessible name for a row's remove button, given its label (or a fallback). */
  removeRow: (label: string) => string;
  /** Accessible name for a keyword chip's remove button. */
  removeKeyword: (keyword: string) => string;
  errorLabelRequired: string;
  errorUrlInvalid: string;
}

const DEFAULT_LABELS: ReferralLinksEditorLabels = {
  sectionTitle: "Referral links",
  optionalTag: "optional",
  siteHelper:
    "Your tracking links, woven into posts where they fit. Links added here seed every new campaign on this site.",
  campaignHelper:
    "Your tracking links, woven into posts where they fit. Seeded from Site SEO — edits apply to this campaign only; site defaults stay unchanged.",
  labelLabel: "Label",
  labelPlaceholder: "Product or brand name",
  urlLabel: "Destination URL",
  urlPlaceholder: "https://…",
  keywordsLabel: "Relevance keywords",
  keywordsOptionalTag: "optional",
  keywordsPlaceholder: "Topics where this link belongs — press Enter to add",
  keywordsAddAria: "Add a relevance keyword",
  anchorToggle: "Exact anchor text",
  anchorToggleQualifier: "— only if your program requires it",
  anchorLabel: "Exact anchor text",
  anchorPlaceholder: "e.g. TrailPass Pro app",
  anchorHint:
    "Used verbatim wherever this link appears. Leave empty and Structura writes a natural anchor for each post.",
  anchorClear: "Clear",
  addLink: "Add referral link",
  emptyText:
    "No referral links yet — add one to have Structura mention it in relevant posts.",
  ftcBefore: "Referral links are usually affiliate relationships. Review the ",
  ftcLink: "affiliate disclosure setting",
  ftcAfter: " for this content — Structura won't switch it on for you.",
  removeRow: (label) => `Remove ${label}`,
  removeKeyword: (keyword) => `Remove ${keyword}`,
  errorLabelRequired: "Label is required — it seeds the anchor text.",
  errorUrlInvalid:
    "Enter a full URL, including https://. Tracking parameters are kept as-is.",
};

export interface ReferralLinksEditorProps {
  /** The referral-link list (parent-owned). */
  value: ReferralLinkValue[];
  /** Called with the full next list on any add / remove / edit. */
  onChange: (next: ReferralLinkValue[]) => void;
  /** Selects the header helper copy; the two bindings are otherwise identical. */
  binding: "site" | "campaign";
  /** `href` for the FTC "affiliate disclosure setting" link. */
  disclosureHref?: string;
  /** Click handler for the FTC disclosure link (used when there's no `href`). */
  onDisclosureClick?: () => void;
  /** Caps/locks every add + edit affordance. */
  disabled?: boolean;
  /** Translated strings; merged over English defaults. */
  labels?: Partial<ReferralLinksEditorLabels>;
}

/** A domain-ish string for the favicon, or "" when the URL isn't parseable yet. */
function faviconDomain(url: string): string {
  const host = url.trim().replace(/^https?:\/\//i, "").split("/")[0];
  return host.includes(".") ? host : "";
}

/** A referral URL is valid only as an absolute http(s) URL. */
function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const emptyRow = (): ReferralLinkValue => ({ url: "", label: "", relevanceKeywords: [] });

export function ReferralLinksEditor({
  value,
  onChange,
  binding,
  disclosureHref,
  onDisclosureClick,
  disabled = false,
  labels: labelOverrides,
}: ReferralLinksEditorProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };

  // Stable per-row React keys, kept in lockstep with `value` through the
  // mutation handlers below (index keys would remount the wrong <input> on a
  // mid-list remove and steal focus). External length changes — e.g. the
  // parent swapping the whole list when the campaign changes — reconcile at
  // render by appending/trimming at the end (a full remount is correct there).
  const idCounter = useRef(0);
  const keys = useRef<number[]>([]);
  while (keys.current.length < value.length) keys.current.push(idCounter.current++);
  if (keys.current.length > value.length) keys.current.length = value.length;

  // Ephemeral, key-scoped UI state (never surfaced to the parent):
  const [errors, setErrors] = useState<Record<number, { label?: boolean; url?: boolean }>>({});
  const [typing, setTyping] = useState<Record<number, string>>({});
  const [openAnchors, setOpenAnchors] = useState<Set<number>>(new Set());

  const focusLabelOfRow = (rowKey: number) => {
    // Defer to the paint after the new row mounts.
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLInputElement>(`[data-referral-label="${rowKey}"]`)
        ?.focus();
    });
  };

  const addRow = () => {
    if (disabled) return;
    const key = idCounter.current++;
    keys.current = [...keys.current, key];
    onChange([...value, emptyRow()]);
    focusLabelOfRow(key);
  };

  const removeRow = (index: number) => {
    if (disabled) return;
    keys.current = keys.current.filter((_, i) => i !== index);
    onChange(value.filter((_, i) => i !== index));
  };

  const patchRow = (index: number, patch: Partial<ReferralLinkValue>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const setError = (rowKey: number, field: "label" | "url", bad: boolean) => {
    setErrors((prev) => {
      const next = { ...(prev[rowKey] ?? {}) };
      if (bad) next[field] = true;
      else delete next[field];
      return { ...prev, [rowKey]: next };
    });
  };

  const addKeyword = (index: number, rowKey: number) => {
    const raw = (typing[rowKey] ?? "").trim();
    if (!raw) return;
    const existing = value[index].relevanceKeywords ?? [];
    if (!existing.includes(raw)) {
      patchRow(index, { relevanceKeywords: [...existing, raw] });
    }
    setTyping((t) => ({ ...t, [rowKey]: "" }));
  };

  const removeKeyword = (index: number, keyword: string) => {
    const existing = value[index].relevanceKeywords ?? [];
    patchRow(index, { relevanceKeywords: existing.filter((k) => k !== keyword) });
  };

  const onKeywordKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    index: number,
    rowKey: number,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addKeyword(index, rowKey);
    } else if (e.key === "Backspace" && (typing[rowKey] ?? "") === "") {
      const existing = value[index].relevanceKeywords ?? [];
      if (existing.length > 0) {
        e.preventDefault();
        removeKeyword(index, existing[existing.length - 1]);
      }
    }
  };

  const openAnchor = (rowKey: number) =>
    setOpenAnchors((s) => new Set(s).add(rowKey));

  const clearAnchor = (index: number, rowKey: number) => {
    patchRow(index, { anchorText: undefined });
    setOpenAnchors((s) => {
      const next = new Set(s);
      next.delete(rowKey);
      return next;
    });
  };

  const helper = binding === "site" ? labels.siteHelper : labels.campaignHelper;

  const disclosureLink =
    onDisclosureClick || disclosureHref ? (
      <a
        href={disclosureHref ?? "#"}
        onClick={(e) => {
          if (onDisclosureClick) {
            e.preventDefault();
            onDisclosureClick();
          }
        }}
        className="font-semibold text-brand-600 hover:underline dark:text-brand-300"
      >
        {labels.ftcLink}
      </a>
    ) : (
      <span className="font-semibold text-neutral-500 dark:text-neutral-400">
        {labels.ftcLink}
      </span>
    );

  const ftcNote = (
    <p className="flex items-start gap-1.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
      <Info size={13} className="mt-px shrink-0" aria-hidden="true" />
      <span>
        {labels.ftcBefore}
        {disclosureLink}
        {labels.ftcAfter}
      </span>
    </p>
  );

  return (
    <section
      aria-label={labels.sectionTitle}
      className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-raised dark:border-neutral-800 dark:bg-neutral-900 dark:ring-1 dark:ring-white/[.04]"
    >
      <header className="flex items-start gap-3 border-b border-neutral-100 px-5 py-4 dark:border-neutral-800">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Link size={17} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-neutral-900 dark:text-white">
            {labels.sectionTitle}{" "}
            <span className="font-normal text-neutral-400 dark:text-neutral-500">
              · {labels.optionalTag}
            </span>
          </p>
          <p className="mt-0.5 text-xs leading-snug text-neutral-400 dark:text-neutral-500">
            {helper}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3 p-5">
        {value.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 px-6 py-9 text-center dark:border-neutral-700">
            <div className="flex size-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 dark:bg-white/[.06] dark:text-neutral-500">
              <Link size={17} aria-hidden="true" />
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
              {labels.emptyText}
            </p>
            <Button variant="secondary" size="sm" onClick={addRow} disabled={disabled}>
              <Plus size={14} />
              {labels.addLink}
            </Button>
          </div>
        ) : (
          <>
            {value.map((row, index) => {
              const rowKey = keys.current[index];
              const rowErr = errors[rowKey] ?? {};
              const keywords = row.relevanceKeywords ?? [];
              const anchorOpen =
                openAnchors.has(rowKey) ||
                (typeof row.anchorText === "string" && row.anchorText.length > 0);

              return (
                <div
                  key={rowKey}
                  className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:ring-1 dark:ring-white/[.04]"
                >
                  <div className="flex items-start gap-2">
                    <div className="grid min-w-0 flex-1 gap-4">
                      {/* Row 1 — Label + URL */}
                      <div
                        className="grid gap-4"
                        style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,3fr)" }}
                      >
                        <InputField
                          label={labels.labelLabel}
                          required
                          size="sm"
                          data-referral-label={rowKey}
                          placeholder={labels.labelPlaceholder}
                          value={row.label}
                          disabled={disabled}
                          aria-invalid={rowErr.label ? true : undefined}
                          error={rowErr.label ? labels.errorLabelRequired : undefined}
                          onChange={(e) => patchRow(index, { label: e.target.value })}
                          onBlur={() => setError(rowKey, "label", row.label.trim() === "")}
                        />
                        <InputField
                          label={labels.urlLabel}
                          required
                          size="sm"
                          type="url"
                          placeholder={labels.urlPlaceholder}
                          value={row.url}
                          disabled={disabled}
                          aria-invalid={rowErr.url ? true : undefined}
                          error={rowErr.url ? labels.errorUrlInvalid : undefined}
                          leftAdornment={
                            faviconDomain(row.url) ? (
                              <Favicon domain={faviconDomain(row.url)} size={14} />
                            ) : (
                              <Globe size={14} className="shrink-0 text-neutral-400" aria-hidden="true" />
                            )
                          }
                          onChange={(e) => patchRow(index, { url: e.target.value })}
                          onBlur={() =>
                            setError(
                              rowKey,
                              "url",
                              row.url.trim() !== "" && !isValidUrl(row.url.trim()),
                            )
                          }
                        />
                      </div>

                      {/* Row 2 — Relevance keywords (chip input) */}
                      <div>
                        <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                          {labels.keywordsLabel}{" "}
                          <span className="text-neutral-300 dark:text-neutral-600">
                            · {labels.keywordsOptionalTag}
                          </span>
                        </label>
                        <div
                          role="group"
                          aria-label={labels.keywordsLabel}
                          className={cn(
                            "flex flex-wrap items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-2.5 py-2 shadow-sm transition-all dark:border-neutral-700 dark:bg-neutral-900",
                            "focus-within:!border-brand-600 focus-within:!ring-4 focus-within:!ring-brand-600/10",
                          )}
                        >
                          {keywords.map((kw) => (
                            <span
                              key={kw}
                              className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs text-brand-800 dark:border-brand-900/40 dark:bg-brand-950/30 dark:text-brand-200"
                            >
                              {kw}
                              <button
                                type="button"
                                aria-label={labels.removeKeyword(kw)}
                                onClick={() => removeKeyword(index, kw)}
                                disabled={disabled}
                                className="ml-0.5 shrink-0 cursor-pointer rounded text-brand-500 transition-colors hover:text-red-600 dark:text-brand-400"
                              >
                                <X size={11} />
                              </button>
                            </span>
                          ))}
                          <input
                            type="text"
                            value={typing[rowKey] ?? ""}
                            placeholder={keywords.length ? "" : labels.keywordsPlaceholder}
                            aria-label={labels.keywordsAddAria}
                            disabled={disabled}
                            onChange={(e) =>
                              setTyping((t) => ({ ...t, [rowKey]: e.target.value }))
                            }
                            onKeyDown={(e) => onKeywordKeyDown(e, index, rowKey)}
                            onBlur={() => addKeyword(index, rowKey)}
                            className="min-w-[130px] flex-1 border-0 bg-transparent px-1.5 py-0.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-white dark:placeholder:text-neutral-600"
                          />
                        </div>
                      </div>

                      {/* Row 3 — Anchor override (progressive disclosure) */}
                      {anchorOpen ? (
                        <InputField
                          label={labels.anchorLabel}
                          size="sm"
                          placeholder={labels.anchorPlaceholder}
                          value={row.anchorText ?? ""}
                          disabled={disabled}
                          onChange={(e) =>
                            patchRow(index, { anchorText: e.target.value || undefined })
                          }
                          rightAdornment={
                            row.anchorText ? (
                              <Button
                                variant="transparent"
                                size="sm"
                                onClick={() => clearAnchor(index, rowKey)}
                                disabled={disabled}
                              >
                                {labels.anchorClear}
                              </Button>
                            ) : undefined
                          }
                        />
                      ) : (
                        <div>
                          <button
                            type="button"
                            aria-expanded={false}
                            onClick={() => openAnchor(rowKey)}
                            disabled={disabled}
                            className="inline-flex items-center gap-1.5 rounded-lg py-1 text-xs font-semibold text-neutral-400 transition-colors hover:text-brand-600 dark:text-neutral-500 dark:hover:text-brand-300"
                          >
                            <Plus size={13} aria-hidden="true" />
                            {labels.anchorToggle}{" "}
                            <span className="font-normal text-neutral-300 dark:text-neutral-600">
                              {labels.anchorToggleQualifier}
                            </span>
                          </button>
                        </div>
                      )}
                      {anchorOpen ? (
                        <p className="-mt-2 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
                          {labels.anchorHint}
                        </p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      aria-label={labels.removeRow(row.label.trim() || labels.sectionTitle)}
                      onClick={() => removeRow(index)}
                      disabled={disabled}
                      className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-all hover:bg-neutral-100 hover:text-red-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-red-400"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              );
            })}

            <div>
              <Button variant="secondary" size="sm" onClick={addRow} disabled={disabled}>
                <Plus size={14} />
                {labels.addLink}
              </Button>
            </div>
          </>
        )}

        {ftcNote}
      </div>
    </section>
  );
}
