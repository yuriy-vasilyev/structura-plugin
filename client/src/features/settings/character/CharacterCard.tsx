/**
 * The character card (recurring-character handoff §6.2): the sheet or the
 * first image, the name and how it is drawn, Replace and Remove, and the
 * kept uploads. Remove sits next to Replace, never in a menu: it is also how
 * consent is withdrawn.
 */
import type { Ref } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { RefreshCw, Trash2 } from "lucide-react";
import { Badge, Button } from "@structura/ui";

import type { EffectiveCharacter } from "./useCharacterEditor";
import { formatCharacterDate, viewImageLabel } from "./visualCharacter";

/** Props for {@link CharacterCard}. */
export interface CharacterCardProps {
  character: EffectiveCharacter;
  /** Name of the signature the sheet was drawn in. */
  sheetSignatureName: string;
  /** The picked signature needs a new sheet (handoff §7). */
  needsNewSheet: boolean;
  /** Replace is offered (the plan can change a character). */
  canReplace: boolean;
  onReplace: () => void;
  onRemove: () => void;
  /** -1 opens the sheet, else an upload's index. */
  onZoom: (index: number) => void;
  replaceRef: Ref<HTMLButtonElement>;
}

/** The finished character inside "Your character". */
export function CharacterCard({
  character,
  sheetSignatureName,
  needsNewSheet,
  canReplace,
  onReplace,
  onRemove,
  onZoom,
  replaceRef,
}: CharacterCardProps) {
  const { name } = character;
  const sheet = character.reference === "sheet" ? character.sheet : undefined;
  const date = formatCharacterDate(sheet?.approvedAt);
  const meta = !sheet
    ? __("Uses your image as it is.", "structura")
    : character.keepOwnStyle
      ? sprintf(
          /* translators: %s: the approval date, e.g. "Nov 18, 2026" */
          __("Keeps its own drawing style. Sheet approved on %s.", "structura"),
          date
        )
      : sprintf(
          /* translators: 1: a style name, e.g. "Ink and fill", 2: the approval date, e.g. "Nov 18, 2026" */
          __("Drawn in %1$s. Sheet approved on %2$s.", "structura"),
          sheetSignatureName,
          date
        );
  const thumb = sheet ?? character.images[0];

  return (
    <div className="flex max-w-[640px] flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          onClick={() => onZoom(sheet ? -1 : 0)}
          aria-label={
            sheet ? __("View the character sheet larger", "structura") : viewImageLabel(1)
          }
          className="focus-visible:ring-brand-500/70 h-14 w-[84px] shrink-0 cursor-zoom-in overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-neutral-200 outline-none ring-inset focus-visible:ring-2 dark:bg-neutral-800 dark:ring-neutral-700"
        >
          {thumb?.url && <img src={thumb.url} alt="" className="h-full w-full object-cover" />}
        </button>
        <div className="min-w-0 flex-1 basis-40">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-neutral-900 dark:text-white">{name}</span>
            {needsNewSheet && (
              <Badge intent="warning" size="xs">
                {__("New sheet needed", "structura")}
              </Badge>
            )}
          </div>
          <p className="mt-0.5! mb-0! text-[12.5px] leading-normal text-neutral-600 dark:text-neutral-400">
            {meta}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canReplace && (
            <Button
              ref={replaceRef}
              variant="secondary"
              size="sm"
              onClick={onReplace}
              aria-label={sprintf(
                /* translators: %s: the character's name, e.g. "Lena" */
                __("Replace %s", "structura"),
                name
              )}
              className="max-sm:min-h-11"
            >
              <RefreshCw size={13} aria-hidden="true" />
              {__("Replace", "structura")}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={onRemove}
            aria-label={sprintf(
              /* translators: %s: the character's name, e.g. "Lena" */
              __("Remove %s", "structura"),
              name
            )}
            className="max-sm:min-h-11"
          >
            {/* The variant fixes the button's text colour; the span carries the danger tone. */}
            <span className="inline-flex items-center gap-1.5 text-red-700 dark:text-red-300">
              <Trash2 size={13} aria-hidden="true" />
              {__("Remove", "structura")}
            </span>
          </Button>
        </div>
      </div>

      {character.images.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-neutral-200 pt-2.5 dark:border-neutral-800">
          <span className="text-[10px] font-black tracking-[0.1em] text-neutral-500 uppercase dark:text-neutral-400">
            {__("Your images", "structura")}
          </span>
          <div className="flex gap-2">
            {character.images.map((image, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onZoom(i)}
                aria-label={viewImageLabel(i + 1)}
                className="focus-visible:ring-brand-500/70 size-10 cursor-zoom-in overflow-hidden rounded-lg bg-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900"
              >
                {image.url && <img src={image.url} alt="" className="h-full w-full object-cover" />}
              </button>
            ))}
          </div>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {sprintf(
              /* translators: %s: the character's name, e.g. "Lena" */
              __("Kept until you remove %s.", "structura"),
              name
            )}
          </span>
        </div>
      )}
    </div>
  );
}
