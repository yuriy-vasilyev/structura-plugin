/**
 * Brand palette (visual-signatures handoff §3.4): the preset's `palette`,
 * accent first, shared by every image and video the preset renders. The
 * Visuals page edits it; the wizard shows it read-only with Re-scan.
 * Spec: specs/visual-signatures.md §2 (palette roles), §8.
 */
import { useEffect, useRef, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { Plus, RefreshCw, ScanSearch, Star, Trash2 } from "lucide-react";
import { Button, InputField, PaletteSwatches, Popover, Skeleton, Spinner } from "@structura/ui";
import { NEUTRAL_PALETTE } from "@structura/visual-signatures";

import { normaliseHexInput, PALETTE_MAX } from "./signatureModel";

/** The colour a new swatch starts from: the neutral set's accent, until the user picks one. */
const NEW_SWATCH = NEUTRAL_PALETTE.accent;

/** Swatch outline that keeps cream and near-black colours visible on both surfaces. */
const SWATCH_RING = "ring-1 ring-inset ring-black/12 dark:ring-white/22";

/** The edit popover's body for one swatch. */
function SwatchEditor({
  hex,
  isAccent,
  onChange,
  onUseAsAccent,
  onRemove,
  close,
}: {
  hex: string;
  isAccent: boolean;
  onChange: (hex: string) => void;
  onUseAsAccent: () => void;
  onRemove: () => void;
  close: () => void;
}) {
  const [text, setText] = useState(hex);
  const [invalid, setInvalid] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-3">
        <input
          type="color"
          aria-label={__("Pick a color", "structura")}
          value={hex.toLowerCase()}
          onChange={(event) => {
            const next = normaliseHexInput(event.target.value);
            if (!next) return;
            setText(next);
            setInvalid(false);
            onChange(next);
          }}
          className="size-[42px]! shrink-0 cursor-pointer rounded-[10px] border border-neutral-200 bg-white p-0.5! dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="min-w-0 flex-1">
          <InputField
            size="sm"
            label={__("Hex", "structura")}
            value={text}
            // Focus lands in Hex when the popover opens (handoff §2.5).
            autoFocus
            spellCheck={false}
            inputClassName="font-mono"
            error={invalid ? __("Use a hex color like #2F6B4F.", "structura") : undefined}
            onChange={(event) => {
              setText(event.target.value);
              const next = normaliseHexInput(event.target.value);
              setInvalid(false);
              if (next) onChange(next);
            }}
            onBlur={() => {
              const next = normaliseHexInput(text);
              if (next) setText(next);
              else setInvalid(true);
            }}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-2.5 dark:border-neutral-700">
        {!isAccent && (
          <Button
            variant="transparent"
            size="sm"
            onClick={() => {
              onUseAsAccent();
              close();
            }}
          >
            <Star aria-hidden="true" />
            {__("Use as accent", "structura")}
          </Button>
        )}
        <Button
          variant="dangerGhost"
          size="sm"
          className="ml-auto"
          onClick={() => {
            onRemove();
            close();
          }}
        >
          <Trash2 aria-hidden="true" />
          {__("Remove", "structura")}
        </Button>
      </div>
    </div>
  );
}

/** Props for {@link BrandPaletteField}. */
export interface BrandPaletteFieldProps {
  /** Id for the section heading. */
  headingId: string;
  /** `#RRGGBB` colours, accent first. */
  palette: string[];
  /** Called with the whole palette after an edit, an add, a remove or a new accent. */
  onChange: (palette: string[]) => void;
  /** A user-started scan is running. */
  scanning: boolean;
  /** Runs the thin pass and replaces the palette ("Scan my site", "Re-scan site"). */
  onScan: () => void;
}

/**
 * BrandPaletteField: swatches with hex labels (the first marked Accent), an
 * edit popover per swatch, up to {@link PALETTE_MAX} colours, the empty and
 * scanning states, and "Re-scan site".
 */
export function BrandPaletteField({
  headingId,
  palette,
  onChange,
  scanning,
  onScan,
}: BrandPaletteFieldProps) {
  const triggers = useRef<Array<HTMLButtonElement | null>>([]);
  const openAfterRender = useRef<number | null>(null);
  const full = palette.length >= PALETTE_MAX;

  // "Add" opens the new swatch's editor: Popover state lives in Headless UI,
  // so the new trigger is clicked once it has rendered.
  useEffect(() => {
    const index = openAfterRender.current;
    if (index === null || !triggers.current[index]) return;
    openAfterRender.current = null;
    triggers.current[index]?.click();
  });

  const add = () => {
    if (full) return;
    openAfterRender.current = palette.length;
    onChange([...palette, NEW_SWATCH]);
  };
  const replace = (index: number, hex: string) =>
    onChange(palette.map((c, i) => (i === index ? hex : c)));
  const remove = (index: number) => onChange(palette.filter((_, i) => i !== index));
  const makeAccent = (index: number) =>
    onChange([palette[index], ...palette.filter((_, i) => i !== index)]);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3
            id={headingId}
            className="m-0! text-base font-bold tracking-tight text-neutral-900 dark:text-white"
          >
            {__("Brand palette", "structura")}
          </h3>
          <p className="m-0! max-w-[62ch] text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {__(
              "Your colors are applied to the style you pick, in images and videos.",
              "structura"
            )}
          </p>
        </div>
        {palette.length > 0 && !scanning && (
          <Button variant="transparent" size="sm" onClick={onScan}>
            <RefreshCw aria-hidden="true" />
            {__("Re-scan site", "structura")}
          </Button>
        )}
      </div>

      {scanning ? (
        <div role="status" className="flex flex-wrap items-center gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="size-14 rounded-xl" />
          ))}
          <span className="inline-flex items-center gap-2 text-[13px] text-neutral-600 dark:text-neutral-400">
            <Spinner size="sm" />
            {__("Reading your homepage for colors…", "structura")}
          </span>
        </div>
      ) : palette.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-600 dark:bg-neutral-900/50">
          <PaletteSwatches
            colors={Object.values(NEUTRAL_PALETTE)}
            size={24}
            label={__("No brand colors yet.", "structura")}
            aria-hidden="true"
            className="opacity-50"
          />
          <p className="m-0! text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">
            <strong className="font-semibold text-neutral-900 dark:text-white">
              {__("No brand colors yet.", "structura")}
            </strong>{" "}
            {__("Until you add some, images use the neutral set above.", "structura")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={onScan}>
              <ScanSearch aria-hidden="true" />
              {__("Scan my site", "structura")}
            </Button>
            <Button variant="link" size="sm" onClick={add}>
              {__("Add a color", "structura")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <ul
            aria-label={__("Brand colors", "structura")}
            className="m-0! flex list-none flex-wrap gap-3 p-0!"
          >
            {palette.map((hex, index) => (
              <li key={`${hex}-${index}`} className="m-0! flex w-16 flex-col items-center gap-1.5">
                <Popover>
                  <Popover.Trigger
                    ref={(node: HTMLButtonElement | null) => {
                      triggers.current[index] = node;
                    }}
                    aria-label={
                      index === 0
                        ? sprintf(
                            /* translators: %s: a hex colour such as #2F6B4F */
                            __("Edit color %s, accent", "structura"),
                            hex
                          )
                        : sprintf(
                            /* translators: %s: a hex colour such as #2F6B4F */
                            __("Edit color %s", "structura"),
                            hex
                          )
                    }
                    className={`focus-visible:outline-brand-500 size-14 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 ${SWATCH_RING}`}
                    style={{ backgroundColor: hex }}
                  />
                  <Popover.Content className="w-72 max-w-[calc(100vw-2rem)] p-3.5">
                    {({ close }: { close: () => void }) => (
                      <SwatchEditor
                        hex={hex}
                        isAccent={index === 0}
                        onChange={(next) => replace(index, next)}
                        onUseAsAccent={() => makeAccent(index)}
                        onRemove={() => remove(index)}
                        close={close}
                      />
                    )}
                  </Popover.Content>
                </Popover>
                <span className="font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                  {hex}
                </span>
                {index === 0 && (
                  <span className="text-[11px] font-bold text-neutral-900 dark:text-white">
                    {__("Accent", "structura")}
                  </span>
                )}
              </li>
            ))}
            <li className="m-0! flex w-16 flex-col items-center gap-1.5">
              <button
                type="button"
                aria-label={__("Add a color", "structura")}
                disabled={full}
                onClick={add}
                className="hover:border-brand-400 hover:text-brand-600 focus-visible:outline-brand-500 flex size-14 cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-dashed border-neutral-300 bg-transparent text-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-400"
              >
                <Plus size={18} aria-hidden="true" />
              </button>
              <span
                aria-hidden="true"
                className="text-[11px] text-neutral-500 dark:text-neutral-400"
              >
                {__("Add", "structura")}
              </span>
            </li>
          </ul>
          {full && (
            <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
              {__("Up to six colors. Remove one to add another.", "structura")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Props for {@link BrandPaletteSummary}. */
export interface BrandPaletteSummaryProps {
  /** `#RRGGBB` colours, accent first. */
  palette: string[];
  /** A Re-scan is running. */
  scanning: boolean;
  /** Reruns the thin pass ("Re-scan"). */
  onScan: () => void;
}

/** The wizard's read-only palette: the colours as pills, Re-scan, and where to edit them (handoff §3.4). */
export function BrandPaletteSummary({ palette, scanning, onScan }: BrandPaletteSummaryProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-neutral-900 dark:text-white">
          {__("Your colors", "structura")}
        </span>
        {scanning ? (
          <span
            role="status"
            className="inline-flex items-center gap-2 text-[13px] text-neutral-600 dark:text-neutral-400"
          >
            <Spinner size="sm" />
            {__("Reading your homepage for colors…", "structura")}
          </span>
        ) : (
          <ul
            aria-label={__("Brand colors", "structura")}
            className="m-0! flex list-none flex-wrap gap-1.5 p-0!"
          >
            {palette.map((hex, index) => (
              <li
                key={`${hex}-${index}`}
                className="m-0! inline-flex items-center gap-1.5 rounded-full border border-neutral-200 py-0.5 pr-2.5 pl-1 dark:border-neutral-700"
              >
                <span
                  aria-hidden="true"
                  className={`size-[18px] rounded-full ${SWATCH_RING}`}
                  style={{ backgroundColor: hex }}
                />
                <span className="font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                  {hex}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!scanning && (
          <Button variant="transparent" size="sm" onClick={onScan}>
            <RefreshCw aria-hidden="true" />
            {__("Re-scan", "structura")}
          </Button>
        )}
      </div>
      <p className="m-0! text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        {__(
          "Your colors are applied to the style you pick, in images and videos. Edit them later on the Visuals page.",
          "structura"
        )}
      </p>
    </div>
  );
}
