/**
 * Character sheet approval (recurring-character handoff §6): the customer's
 * images beside the whole sheet, each pressable to zoom; Approve, Try again
 * and Back to my images. States: rendering first (no sheet), rendering again
 * (the old sheet under a scrim), ready, failed first (no sheet, Try again is
 * primary), failed again (the previous sheet kept and still approvable). A
 * failed sheet spends no image, and the failure says so.
 */
import { __, sprintf } from "@wordpress/i18n";
import { ArrowLeft, Check, CircleAlert, Maximize2, PenLine, RotateCcw } from "lucide-react";
import { Button, ProgressBar } from "@structura/ui";

import type { CharacterEditor } from "./useCharacterEditor";
import { sheetAlt, viewImageLabel } from "./visualCharacter";

const OVERLINE =
  "text-[10px] font-black tracking-[0.1em] text-neutral-500 uppercase dark:text-neutral-400";

/** Props for {@link SheetApproval}. */
export interface SheetApprovalProps {
  editor: CharacterEditor;
  /** Name of the signature the sheet is (being) drawn in. */
  signatureName: string;
  /** Opens the zoom: -1 for the sheet, else an upload's index. */
  onZoom: (index: number) => void;
}

/** The approval view inside "Your character". */
export function SheetApproval({ editor, signatureName, onZoom }: SheetApprovalProps) {
  const name = editor.fields.name.trim() || editor.effective?.name || "";
  const sheet = editor.draftSheet;
  const drawing = editor.drawState === "drawing";
  const failed = editor.drawState === "failed";
  const ready = !!sheet && !drawing;
  const cost = <span className="font-medium opacity-80">{__("· 1 image", "structura")}</span>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h4 className="m-0! text-[15px] font-bold tracking-tight text-neutral-900 dark:text-white">
          {sprintf(
            /* translators: %s: the character's name, e.g. "Lena" */
            __("Does this look like %s?", "structura"),
            name
          )}
        </h4>
        <p className="m-0! max-w-[62ch] text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {sprintf(
            /* translators: %s: the character's name, e.g. "Lena" */
            __(
              "Compare the sheet with your own images. Approve only if you’d recognize %s at a glance: every new image starts from this sheet. Press any image to see it larger.",
              "structura"
            ),
            name
          )}
        </p>
      </div>

      <div className="@container">
        <div className="grid grid-cols-[168px_minmax(0,1fr)] gap-4 @max-[560px]:grid-cols-1">
          <div className="flex flex-col gap-2">
            <span className={OVERLINE}>{__("Your images", "structura")}</span>
            <div className="grid grid-cols-2 gap-2 @max-[560px]:grid-cols-3">
              {editor.images.map((image, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onZoom(i)}
                  aria-label={viewImageLabel(i + 1)}
                  className="focus-visible:ring-brand-500/70 relative aspect-square cursor-zoom-in overflow-hidden rounded-[10px] bg-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900"
                >
                  {image.url && (
                    <img src={image.url} alt="" className="h-full w-full object-cover" />
                  )}
                  <span
                    aria-hidden="true"
                    className="absolute right-1.5 bottom-1.5 flex size-[26px] items-center justify-center rounded-full bg-white/94 text-neutral-700 shadow-sm dark:bg-neutral-900/94 dark:text-neutral-200"
                  >
                    <Maximize2 size={13} />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <span className={OVERLINE}>
              {sprintf(
                /* translators: %s: a style name, e.g. "Ink and fill" */
                __("Character sheet · %s", "structura"),
                signatureName
              )}
            </span>
            {sheet && !drawing ? (
              <button
                type="button"
                onClick={() => onZoom(-1)}
                aria-label={__("View the character sheet larger", "structura")}
                className="focus-visible:ring-brand-500/70 relative block aspect-[3/2] cursor-zoom-in overflow-hidden rounded-xl bg-neutral-50 ring-1 ring-neutral-200 outline-none ring-inset focus-visible:ring-2 dark:bg-neutral-800/60 dark:ring-neutral-700"
              >
                {sheet.url && (
                  <img
                    src={sheet.url}
                    alt={sheetAlt(name, signatureName)}
                    className="h-full w-full object-contain"
                  />
                )}
                <span
                  aria-hidden="true"
                  className="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/94 px-2.5 py-1 text-xs font-bold text-neutral-800 shadow-sm dark:bg-neutral-900/94 dark:text-neutral-100"
                >
                  <Maximize2 size={13} />
                  {__("View larger", "structura")}
                </span>
              </button>
            ) : (
              <div className="relative aspect-[3/2] overflow-hidden rounded-xl bg-neutral-50 ring-1 ring-neutral-200 ring-inset dark:bg-neutral-800/60 dark:ring-neutral-700">
                {drawing && sheet?.url && (
                  <img
                    src={sheet.url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-contain opacity-35"
                  />
                )}
                <div
                  className={
                    drawing && sheet
                      ? "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/72 px-4 text-center dark:bg-neutral-900/72"
                      : "absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center"
                  }
                >
                  <PenLine
                    size={28}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className="text-neutral-400 dark:text-neutral-500"
                  />
                  <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-200">
                    {drawing
                      ? sprintf(
                          /* translators: 1: the character's name, e.g. "Lena", 2: a style name, e.g. "Ink and fill" */
                          __("Drawing %1$s in %2$s", "structura"),
                          name,
                          signatureName
                        )
                      : __("No sheet yet", "structura")}
                  </span>
                </div>
                {drawing && <ProgressBar className="absolute inset-x-4 bottom-4 w-auto" />}
              </div>
            )}
          </div>
        </div>
      </div>

      <p
        role="status"
        className={drawing ? "m-0! text-xs text-neutral-500 dark:text-neutral-400" : "sr-only"}
      >
        {drawing
          ? sheet
            ? __(
                "Drawing a new sheet. Your current one stays until this one is ready.",
                "structura"
              )
            : sprintf(
                /* translators: %s: the character's name, e.g. "Lena" */
                __(
                  "Drawing three full-length views and two close-ups of %s. This takes about a minute; you can keep editing meanwhile.",
                  "structura"
                ),
                name
              )
          : ""}
      </p>

      {failed && (
        <div
          role="alert"
          className="flex max-w-[640px] items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
        >
          <CircleAlert
            size={16}
            aria-hidden="true"
            className="mt-px shrink-0 text-red-600 dark:text-red-400"
          />
          <span>
            {sheet
              ? __(
                  "The new sheet didn’t finish, so your last one is still shown. Try again in a moment, or approve the one you see.",
                  "structura"
                )
              : __("The sheet didn’t finish. Try again in a moment.", "structura")}{" "}
            {__("This didn’t use an image.", "structura")}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          {ready && (
            <Button
              onClick={() => void editor.approveSheet()}
              loading={editor.approving}
              className="max-sm:min-h-11"
            >
              <Check size={15} aria-hidden="true" />
              {__("Approve", "structura")}
            </Button>
          )}
          {/* Not while the first sheet renders; disabled while another one does. */}
          {sheet || failed ? (
            <Button
              variant={!sheet && failed ? "primary" : "secondary"}
              onClick={editor.tryAgain}
              disabled={drawing || editor.approving}
              className="max-sm:min-h-11 max-sm:text-wrap"
            >
              <RotateCcw size={15} aria-hidden="true" />
              {__("Try again", "structura")}
              {cost}
            </Button>
          ) : null}
          <Button
            variant="transparent"
            onClick={editor.backToImages}
            disabled={drawing}
            className="max-sm:min-h-11 max-sm:text-wrap"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            {__("Back to my images", "structura")}
          </Button>
        </div>
        {(sheet || failed) && (
          <p className="m-0! text-xs leading-normal text-neutral-500 dark:text-neutral-400">
            {__(
              "Try again draws a new sheet from the same images. It uses one image once it finishes.",
              "structura"
            )}
          </p>
        )}
      </div>
    </div>
  );
}
