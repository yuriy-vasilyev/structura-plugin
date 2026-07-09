import { Popover as HeadlessPopover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Check, ChevronDown, Lock, Search, SearchX, X } from "lucide-react";
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../utils";
import { formFieldTriggerVariants } from "../variants/form-field";

/**
 * Combobox — searchable, grouped, single-select picker.
 *
 * Built for the video voice picker (39 voices across two TTS providers)
 * but generic: grouped options with sticky counted headers, in-popover
 * search with substring highlighting, per-group gating (locked header +
 * teaser row instead of options), per-row trailing action slots (e.g. a
 * play-sample circle), and trigger adornment slots.
 *
 * Spec: marketing/design_handoff_voice_picker/README.md ("Primitive API").
 *
 * The floating panel mounts lazily via Headless UI's Popover — never
 * eagerly — because an eagerly-mounted anchored panel loops floating-ui
 * at rest (React #185; see DropdownMenu's history). Adornments and
 * trailing actions are rendered as SIBLING elements of the buttons/rows,
 * never nested inside them: nested interactive elements are invalid HTML
 * and would leak into the trigger's/option's accessible name.
 */

/** One selectable row inside a {@link ComboboxGroup}. */
export interface ComboboxOption {
  /** Canonical stored id (e.g. `gemini:Zephyr`). Unique across ALL groups. */
  id: string;
  /** Primary line, 13/600. Matched by the default search filter. */
  label: string;
  /** Secondary line, 11px neutral-500. Also matched by the default filter. */
  description?: string;
  /**
   * Chip after the label. A bare string renders the handoff's subtle
   * outline pill (e.g. "Default" on the platform-default voice); pass a
   * node for anything richer.
   */
  badge?: React.ReactNode;
  /**
   * Per-row action slot (e.g. the play-sample circle). Rendered as a
   * sibling of the `role="option"` element — never inside it — so the
   * action button stays out of the option's accessible name and click
   * target. Space on the keyboard-focused row activates it (see
   * {@link ComboboxProps.onOptionAction}).
   */
  trailing?: React.ReactNode;
  /** Renders dimmed, unselectable, and skipped by ↑↓ navigation. */
  disabled?: boolean;
}

/**
 * Gate for a group the current plan/tier cannot use. When present the
 * group's options are hidden (and excluded from search + ↑↓ navigation)
 * and a dashed teaser row with the CTA link renders instead — the group
 * is never hidden entirely (discovery), never selectable.
 */
export interface ComboboxGate {
  /** One-line value prop ("Connect a Gemini API key to unlock 30 more voices."). Pre-translated. */
  text: React.ReactNode;
  /** Link to wherever the gate is lifted (e.g. AI-keys settings). Tab-reachable. */
  cta: { label: React.ReactNode; href: string };
}

/** A titled section of options with a sticky, counted header. */
export interface ComboboxGroup {
  id: string;
  /** Overline-style header label (e.g. "OpenAI"). Pre-translated. */
  label: React.ReactNode;
  /**
   * Total shown in the header (and in a gated group's locked header).
   * Defaults to `options.length` — pass explicitly when a gated group's
   * options aren't loaded client-side.
   */
  count?: number;
  /** Present ⇒ options hidden, teaser rendered. See {@link ComboboxGate}. */
  gate?: ComboboxGate;
  options: ComboboxOption[];
}

export interface ComboboxProps {
  /** Selected option id (canonical, e.g. `gemini:Zephyr`). */
  value?: string;
  /** Fires with the clicked/Enter-selected option's id; the popover closes. */
  onChange: (id: string) => void;
  groups: ComboboxGroup[];
  /** Search input placeholder ("Search 39 voices…"). Pre-translated. */
  placeholder?: string;
  /** Shown in the closed trigger when `value` matches no option. Pre-translated. */
  triggerPlaceholder?: string;
  /** Pinned under the list, outside the scroll region. Pre-translated. */
  footnote?: React.ReactNode;
  /**
   * Search predicate. Receives the trimmed query as typed; the default
   * matches option label OR description, case-insensitively. Gated
   * groups are excluded from search regardless of the filter.
   */
  filter?: (option: ComboboxOption, query: string) => boolean;
  /**
   * Leading trigger slot (e.g. the provider mini-badge). Rendered as a
   * SIBLING overlay of the trigger button, never inside it.
   */
  leadingAdornment?: React.ReactNode;
  /**
   * Trailing trigger slot (e.g. the play-current-voice circle), sitting
   * between the value and the chevron. Sibling of the trigger button —
   * same contract as `Select.Trigger`'s `trailingAdornment`.
   */
  trailingAdornment?: React.ReactNode;
  /**
   * Fires when Space is pressed on the keyboard-focused row — the
   * handoff's "Space plays the focused row's sample". When omitted,
   * Space programmatically clicks the first button in that row's
   * `trailing` slot instead. Space only acts while navigating (on open,
   * or after ↑↓); once the user types in the search box, Space types a
   * literal space until the next arrow key.
   */
  onOptionAction?: (id: string) => void;
  disabled?: boolean;
  className?: string;
  /** Empty-state headline for a query with no matches. Pre-translated. */
  noMatchesLabel?: (query: string) => React.ReactNode;
  /** Label for the ✕ button and the empty-state "Clear search" action. Pre-translated. */
  clearSearchLabel?: string;
  /** Header count while searching. Defaults to English "n of total" — pass a translation. */
  searchCountLabel?: (matched: number, total: number) => React.ReactNode;
}

/** Case-insensitive label-or-description substring match (handoff "Search behavior"). */
const defaultFilter = (option: ComboboxOption, query: string): boolean => {
  const q = query.toLowerCase();
  return (
    option.label.toLowerCase().includes(q) ||
    (option.description?.toLowerCase().includes(q) ?? false)
  );
};

/** Wraps the first case-insensitive occurrence of `query` in a brand-tinted `<mark>`. */
const highlight = (text: string, query: string): React.ReactNode => {
  if (!query) return text;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-brand-100 px-0.5 text-brand-800 dark:bg-brand-500/25 dark:text-brand-200">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
};

const OVERLINE =
  "text-[10px] font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500";

/** Flat navigable item — gated groups and disabled options are excluded. */
type NavItem = { option: ComboboxOption; groupId: string };

interface PanelProps
  extends Required<Pick<ComboboxProps, "onChange" | "groups">>,
    Pick<
      ComboboxProps,
      | "value"
      | "placeholder"
      | "footnote"
      | "filter"
      | "onOptionAction"
      | "noMatchesLabel"
      | "clearSearchLabel"
      | "searchCountLabel"
    > {
  close: () => void;
  listboxId: string;
  baseId: string;
}

/**
 * Popover body. A separate component (mounted only while open) so search
 * text and the active row reset naturally on every open.
 */
const ComboboxPanel: React.FC<PanelProps> = ({
  value,
  onChange,
  groups,
  placeholder,
  footnote,
  filter,
  onOptionAction,
  noMatchesLabel,
  clearSearchLabel = "Clear search",
  searchCountLabel,
  close,
  listboxId,
  baseId,
}) => {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(value ?? null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Space-to-action arming: true while the user is navigating (on open,
  // or after ↑↓), false while typing — so Space can still type a literal
  // space into a multi-word query. See ComboboxProps.onOptionAction.
  const navigatingRef = useRef(true);
  const trailingRefs = useRef(new Map<string, HTMLSpanElement | null>());

  const q = query.trim();
  const filterFn = filter ?? defaultFilter;

  const view = groups.map((group) => {
    const total = group.count ?? group.options.length;
    const matched = group.gate ? [] : q ? group.options.filter((o) => filterFn(o, q)) : group.options;
    return { group, total, matched };
  });
  const matchedTotal = view.reduce((n, v) => n + v.matched.length, 0);
  const navItems: NavItem[] = view.flatMap((v) =>
    v.matched.filter((o) => !o.disabled).map((option) => ({ option, groupId: v.group.id }))
  );

  // Derive the effective active row so a query that filters the active
  // option out falls back to the first match without an effect/render lag.
  const activeIndexRaw = navItems.findIndex((i) => i.option.id === activeId);
  const activeIndex = activeIndexRaw === -1 ? (navItems.length > 0 ? 0 : -1) : activeIndexRaw;
  const active = activeIndex >= 0 ? navItems[activeIndex] : null;

  const optionDomId = (id: string) => `${baseId}-option-${id}`;

  // On open the selected option is focused and scrolled into view; while
  // navigating, keep the active row visible. Guarded — jsdom has no
  // scrollIntoView.
  useEffect(() => {
    if (!active) return;
    document.getElementById(optionDomId(active.option.id))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.option.id]);

  const move = (delta: 1 | -1) => {
    navigatingRef.current = true;
    if (navItems.length === 0) return;
    const next =
      activeIndex === -1
        ? delta > 0
          ? 0
          : navItems.length - 1
        : (activeIndex + delta + navItems.length) % navItems.length;
    setActiveId(navItems[next].option.id);
  };

  const select = (id: string) => {
    onChange(id);
    close();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Enter":
        // Always swallow Enter so a surrounding form never submits.
        event.preventDefault();
        if (active) select(active.option.id);
        break;
      case " ": {
        if (!navigatingRef.current || !active) return;
        const { option } = active;
        if (!onOptionAction && option.trailing == null) return;
        event.preventDefault();
        if (onOptionAction) onOptionAction(option.id);
        else trailingRefs.current.get(option.id)?.querySelector("button")?.click();
        break;
      }
      default:
        break;
    }
  };

  const clearSearch = () => {
    setQuery("");
    navigatingRef.current = true;
    inputRef.current?.focus();
  };

  const renderOption = (option: ComboboxOption) => {
    const selected = option.id === value;
    const isActive = active?.option.id === option.id;
    return (
      <div
        key={option.id}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-[7px]",
          option.disabled
            ? "opacity-40"
            : selected
              ? "bg-brand-50 dark:bg-brand-500/10"
              : isActive
                ? "bg-neutral-100 ring-2 ring-brand-500/40 ring-inset dark:bg-neutral-700/60"
                : "hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
        )}
        // Keep focus (and the aria-activedescendant wiring) in the search
        // input when a row or its trailing action is clicked.
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          // Clicks on the trailing action (or any link) belong to it — a
          // play tap must not also change the saved voice.
          if ((event.target as HTMLElement).closest("button, a")) return;
          if (!option.disabled) select(option.id);
        }}
      >
        <div
          role="option"
          id={optionDomId(option.id)}
          aria-selected={selected}
          aria-disabled={option.disabled || undefined}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2",
            !option.disabled && "cursor-pointer"
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
                {highlight(option.label, q)}
              </span>
              {option.badge != null &&
                (typeof option.badge === "string" ? (
                  <span className="inline-flex items-center rounded-full border border-neutral-200 px-1.5 py-0.5 text-[9px] leading-none font-bold tracking-wide text-neutral-400 uppercase dark:border-neutral-600 dark:text-neutral-400">
                    {option.badge}
                  </span>
                ) : (
                  option.badge
                ))}
            </div>
            {option.description != null && (
              <span className="block truncate text-[11px] leading-tight text-neutral-500 dark:text-neutral-400">
                {highlight(option.description, q)}
              </span>
            )}
          </div>
          {selected && (
            <Check
              className="size-[15px] shrink-0 text-brand-600 dark:text-brand-400"
              aria-hidden="true"
            />
          )}
        </div>
        {option.trailing != null && (
          <span
            ref={(el) => {
              trailingRefs.current.set(option.id, el);
            }}
            className="flex shrink-0 items-center"
          >
            {option.trailing}
          </span>
        )}
      </div>
    );
  };

  const renderGroup = ({ group, total, matched }: (typeof view)[number]) => {
    const headerId = `${baseId}-group-${group.id}`;
    const gated = group.gate != null;
    const count = gated || !q ? total : (searchCountLabel?.(matched.length, total) ?? `${matched.length} of ${total}`);
    return (
      <div role="group" aria-labelledby={headerId} key={group.id}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-md bg-white/95 px-2.5 pt-2 pb-1 backdrop-blur-sm dark:bg-neutral-800/95">
          {/* The id sits on the label span (not the header row) so the
              group's accessible name is "OpenAI", not "OpenAI 9". */}
          <span id={headerId} className={cn("flex items-center gap-1.5", OVERLINE)}>
            {gated && <Lock className="-mt-px size-2.5 shrink-0" aria-hidden="true" />}
            {group.label}
          </span>
          <span className="font-mono text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
            {count}
          </span>
        </div>
        {group.gate != null ? (
          <div className="mx-1 mb-1 flex items-center gap-3 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/70 px-3 py-2.5 dark:border-neutral-700 dark:bg-white/[.03]">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400 dark:bg-white/[.06] dark:text-neutral-500">
              <Lock className="size-3.5" aria-hidden="true" />
            </div>
            <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-neutral-500 dark:text-neutral-400">
              {group.gate.text}
            </p>
            {/* Tab-reachable by design; excluded from ↑↓ (it's not an option). CTA never wraps. */}
            <a
              href={group.gate.cta.href}
              className="shrink-0 text-[11.5px] font-bold text-brand-600 hover:underline dark:text-brand-400"
            >
              {group.gate.cta.label}
            </a>
          </div>
        ) : (
          matched.map(renderOption)
        )}
      </div>
    );
  };

  const showEmptyState = q.length > 0 && matchedTotal === 0;

  return (
    <>
      <div className="mb-1 flex items-center gap-2 border-b border-neutral-100 px-2.5 pt-1 pb-2 dark:border-neutral-700">
        <Search className="size-3.5 shrink-0 text-neutral-400" aria-hidden="true" />
        <input
          ref={inputRef}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the popover is a search-first surface; focusing the field on open is the design's intent
          autoFocus
          type="text"
          value={query}
          placeholder={placeholder}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={active ? optionDomId(active.option.id) : undefined}
          onChange={(event) => {
            navigatingRef.current = false;
            setQuery(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          className="w-full min-w-0 flex-1 !border-0 !bg-transparent !p-0 text-sm !text-neutral-900 !shadow-none !ring-0 !outline-none placeholder:text-neutral-400 dark:!text-neutral-100 dark:placeholder:text-neutral-500"
        />
        {query ? (
          <button
            type="button"
            aria-label={clearSearchLabel}
            onClick={clearSearch}
            className="flex size-5 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        ) : (
          <kbd
            aria-hidden="true"
            className="shrink-0 rounded border border-neutral-200 px-1 py-0.5 font-mono text-[9px] text-neutral-400 dark:border-neutral-600 dark:text-neutral-500"
          >
            ↑↓
          </kbd>
        )}
      </div>
      <div
        role="listbox"
        id={listboxId}
        className="max-h-[380px] overflow-y-auto overscroll-contain"
      >
        {showEmptyState && (
          <div className="flex flex-col items-center gap-2 px-4 py-7 text-center">
            <div className="flex size-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 dark:bg-white/[.06] dark:text-neutral-500">
              <SearchX className="size-4" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              {noMatchesLabel?.(q) ?? <>No matches for &ldquo;{q}&rdquo;</>}
            </p>
            <button
              type="button"
              onClick={clearSearch}
              className="text-xs font-bold text-brand-600 hover:underline dark:text-brand-400"
            >
              {clearSearchLabel}
            </button>
          </div>
        )}
        {view
          // With zero matches anywhere the empty state replaces all
          // searchable groups; gated headers stay pinned after it
          // (handoff: gated groups are excluded from search but never hidden).
          .filter((v) => !showEmptyState || v.group.gate != null)
          .map(renderGroup)}
      </div>
      {footnote != null && (
        <p className="mt-0.5 border-t border-neutral-100 px-2.5 pt-2 pb-1 text-[11px] leading-snug text-neutral-400 dark:border-neutral-700 dark:text-neutral-500">
          {footnote}
        </p>
      )}
    </>
  );
};

/**
 * Grouped, searchable single-select combobox (see module docblock).
 *
 * @example
 * ```tsx
 * <Combobox
 *   value="gemini:Zephyr"
 *   onChange={save}
 *   groups={[{ id: "gemini", label: "Gemini", options: voices }]}
 *   placeholder={__("Search 39 voices…", "structura")}
 *   footnote={__("Samples are English; videos follow your post language.", "structura")}
 *   leadingAdornment={<ProviderBadge />}
 *   trailingAdornment={<PlaySampleButton />}
 * />
 * ```
 */
export const Combobox: React.FC<ComboboxProps> = ({
  value,
  onChange,
  groups,
  placeholder,
  triggerPlaceholder = "Select an option...",
  footnote,
  filter,
  leadingAdornment,
  trailingAdornment,
  onOptionAction,
  disabled = false,
  className,
  noMatchesLabel,
  clearSearchLabel,
  searchCountLabel,
}) => {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  // The stored value may live in a gated group (e.g. after a downgrade) —
  // still resolve it for the closed trigger so the field never goes blank.
  const selectedOption = groups.flatMap((g) => g.options).find((o) => o.id === value);

  // Reserve trigger padding for the leading adornment overlay. Measured
  // (not fixed) because the slot's width is consumer-defined; 16px field
  // padding + slot + 8px gap mirrors the handoff's px-4 / gap-2 trigger.
  const leadingRef = useRef<HTMLSpanElement>(null);
  const [leadingWidth, setLeadingWidth] = useState(0);
  useLayoutEffect(() => {
    setLeadingWidth(leadingAdornment != null ? (leadingRef.current?.offsetWidth ?? 0) : 0);
  }, [leadingAdornment]);

  const button = (
    <PopoverButton
      role="combobox"
      aria-haspopup="listbox"
      disabled={disabled}
      style={leadingAdornment != null ? { paddingLeft: 16 + leadingWidth + 8 } : undefined}
      className={cn(
        formFieldTriggerVariants({ size: "md" }),
        "flex items-center justify-between",
        // Same reservation as Select.Trigger: room for the trailing
        // adornment between value and chevron so long labels truncate
        // before sliding under it.
        trailingAdornment != null && "pr-16"
      )}
    >
      {selectedOption ? (
        <span className="truncate">
          {selectedOption.label}
          {selectedOption.description != null && (
            <span className="text-neutral-500 dark:text-neutral-400">
              {" "}
              — {selectedOption.description}
            </span>
          )}
        </span>
      ) : (
        <span className="truncate text-neutral-400 dark:text-neutral-500">
          {triggerPlaceholder}
        </span>
      )}
      <ChevronDown
        className="absolute right-3 size-4 shrink-0 text-neutral-400 transition-transform duration-200 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </PopoverButton>
  );

  return (
    <HeadlessPopover className={cn("relative", className)}>
      {leadingAdornment != null || trailingAdornment != null ? (
        <div className="relative">
          {button}
          {leadingAdornment != null && (
            // pointer-events-none lets clicks on the badge fall through to
            // the trigger button beneath it — the whole field stays clickable.
            <span
              ref={leadingRef}
              className="pointer-events-none absolute inset-y-0 left-4 z-10 flex items-center"
            >
              {leadingAdornment}
            </span>
          )}
          {trailingAdornment != null && (
            <span className="absolute inset-y-0 right-9 z-10 flex items-center">
              {trailingAdornment}
            </span>
          )}
        </div>
      ) : (
        button
      )}
      <PopoverPanel
        anchor={{ to: "bottom start", gap: 8 }}
        transition
        className={cn(
          // Elevation-2 floating surface; dark mode is elevation-by-brightness
          // (bg-neutral-800 over the page's 900) + glass-edge ring.
          // w-(--button-width): the panel hugs the trigger field's width.
          // z-[100060] sits above the Dialog modal layer (z-[100050]) — the
          // voice picker's first home is ConfigureConnectionModal. See
          // Select.Content / Dialog.tsx for the layer scheme.
          "z-[100060] flex w-[var(--button-width)] flex-col rounded-xl border border-neutral-200 bg-white p-1.5 shadow-floating",
          "dark:border-neutral-700 dark:bg-neutral-800 dark:ring-1 dark:ring-white/[.06]",
          "duration-fast origin-top transition ease-out data-closed:translate-y-1 data-closed:opacity-0 motion-reduce:transition-none",
          "focus:outline-none"
        )}
      >
        {({ close }) => (
          <ComboboxPanel
            value={value}
            onChange={onChange}
            groups={groups}
            placeholder={placeholder}
            footnote={footnote}
            filter={filter}
            onOptionAction={onOptionAction}
            noMatchesLabel={noMatchesLabel}
            clearSearchLabel={clearSearchLabel}
            searchCountLabel={searchCountLabel}
            close={close}
            listboxId={listboxId}
            baseId={baseId}
          />
        )}
      </PopoverPanel>
    </HeadlessPopover>
  );
};
