/**
 * "Draft from images" (specs/visual-signatures.md §14.4): the panel under
 * the builder's header with three sample slots (the character intake's
 * `UploadSlot`), the line on what happens to the images, the colours the
 * last draft read from them with "Use these colors", and Draft. The picks
 * live in the builder (`useSampleImages`).
 */
import { useEffect, useId, useRef } from "react";
import { __, _x } from "@wordpress/i18n";
import { Sparkles } from "lucide-react";
import { Button } from "@structura/ui";

import { UploadSlot } from "../character/UploadSlot";
import { PaletteSwatchList } from "./BrandPaletteField";
import type { SampleImages } from "./useSampleImages";

/** Props for {@link ImageDraftPanel}. */
export interface ImageDraftPanelProps {
  /** The id the toggle's `aria-controls` names. */
  id: string;
  samples: SampleImages;
  /** The draft from these images is running. */
  drafting: boolean;
  /** "Draft from my site" is running. */
  blocked: boolean;
  onDraft: () => void;
  /** `#RRGGBB` colours the last draft read from the samples, accent first; none hides the row. */
  colors: string[];
  /** "Use these colors": puts {@link colors} in the form's palette. */
  onUseColors: () => void;
}

/** The panel under the builder's header. */
export function ImageDraftPanel({
  id,
  samples,
  drafting,
  blocked,
  onDraft,
  colors,
  onUseColors,
}: ImageDraftPanelProps) {
  const colorsLabelId = useId();
  const slots = useRef<Array<HTMLElement | null>>([]);
  // After a Remove, focus goes to the slot that now holds the next sample, or the first free one.
  const focusSlot = useRef<number | null>(null);
  useEffect(() => {
    if (focusSlot.current === null) return;
    slots.current[focusSlot.current]?.focus();
    focusSlot.current = null;
  });

  return (
    <div
      id={id}
      role="group"
      aria-label={__("Draft from images", "structura")}
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3.5 dark:border-neutral-700 dark:bg-neutral-800/60"
    >
      <p className="m-0! max-w-[62ch] text-[12.5px] leading-normal text-neutral-600 dark:text-neutral-300">
        {__(
          "Upload up to three images in the style you want. We read the style from them and draft the medium, the technique and what to avoid. The images aren’t stored.",
          "structura"
        )}
      </p>
      {/* Two columns on a phone, three from 640 px, as in the character intake. */}
      <div className="grid max-w-[480px] grid-cols-2 gap-3 sm:grid-cols-3">
        {samples.views.map((view, i) => (
          <UploadSlot
            key={i}
            index={i}
            view={view}
            disabled={samples.reading || drafting}
            onPick={(file) => void samples.add(file)}
            onRemove={() => {
              focusSlot.current = Math.min(i, samples.count - 1);
              samples.removeAt(i);
            }}
            slotRef={(element) => {
              slots.current[i] = element;
            }}
          />
        ))}
      </div>
      <div>
        <Button
          size="sm"
          loading={drafting}
          disabled={samples.count === 0 || samples.reading || blocked}
          onClick={onDraft}
        >
          <Sparkles aria-hidden="true" />
          {drafting ? __("Reading your images", "structura") : _x("Draft", "verb", "structura")}
        </Button>
      </div>
      {colors.length > 0 && (
        <div className="flex flex-col gap-2.5 border-t border-neutral-200 pt-3 dark:border-neutral-700">
          <span
            id={colorsLabelId}
            className="text-[13px] font-bold text-neutral-900 dark:text-white"
          >
            {__("Colors in your images", "structura")}
          </span>
          <PaletteSwatchList palette={colors} labelledBy={colorsLabelId} />
          <div>
            <Button variant="secondary" size="sm" disabled={drafting} onClick={onUseColors}>
              {__("Use these colors", "structura")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
