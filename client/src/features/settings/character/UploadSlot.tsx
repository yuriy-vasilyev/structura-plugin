/**
 * One square image slot of the character intake (recurring-character
 * handoff §5): empty (required or optional) as a drop target, uploading with
 * the browser's preview, uploaded with Remove, or refused (too large, HEIC,
 * other type) with Choose another. The dropzone vocabulary is `FileUpload`'s;
 * errors stay in the slot.
 */
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { CircleAlert, ImagePlus, X } from "lucide-react";
import { Button, ProgressBar, cn } from "@structura/ui";

import { CHARACTER_ACCEPT, formatMegabytes, type UploadRefusal } from "./visualCharacter";

/** What a slot shows. */
export type UploadSlotView =
  | { kind: "empty"; optional: boolean }
  | { kind: "uploading"; previewUrl: string }
  | { kind: "uploaded"; url: string | null; fileName?: string }
  | { kind: "error"; refusal: UploadRefusal; size: number };

/** Props for {@link UploadSlot}. */
export interface UploadSlotProps {
  /** 0-based position; the copy counts from 1. */
  index: number;
  view: UploadSlotView;
  onPick: (file: File) => void;
  onRemove?: () => void;
  /** Opens the zoom on an uploaded image. */
  onZoom?: () => void;
  /** Another upload or removal is running. */
  disabled?: boolean;
  /** The first empty slot while Draw or Use was refused for no image. */
  invalid?: boolean;
  /** Id of the line that says why, for `aria-describedby`. */
  describedBy?: string;
  /** The slot's focusable element, for focus moves. */
  slotRef?: (element: HTMLElement | null) => void;
}

/** The refusal's two lines: a bold lead and what to do. */
function refusalCopy(refusal: UploadRefusal, size: number): { lead: string; body: string } {
  if (refusal === "tooLarge") {
    return {
      lead: sprintf(
        /* translators: %s: the file size in megabytes, e.g. "14.2" */
        __("This image is %s MB.", "structura"),
        formatMegabytes(size)
      ),
      body: __("Use one under 10 MB.", "structura"),
    };
  }
  if (refusal === "heic") {
    return {
      lead: __("HEIC is an iPhone photo format we can’t use.", "structura"),
      body: __("Export it as JPG first, then add it here.", "structura"),
    };
  }
  return {
    lead: __("This file type can’t be used.", "structura"),
    body: __("Use a JPG, PNG or WebP image.", "structura"),
  };
}

/** One slot of the intake's image grid. */
export function UploadSlot({
  index,
  view,
  onPick,
  onRemove,
  onZoom,
  disabled = false,
  invalid = false,
  describedBy,
  slotRef,
}: UploadSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const n = index + 1;

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };
  const onFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still fires.
    event.target.value = "";
    if (file) onPick(file);
  };
  const dropProps = {
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      if (!disabled) setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file && !disabled) onPick(file);
    },
  };
  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={CHARACTER_ACCEPT}
      className="s-hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={onFiles}
    />
  );

  if (view.kind === "uploaded") {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="relative aspect-square overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-neutral-200 ring-inset dark:bg-neutral-800 dark:ring-neutral-700">
          <button
            ref={slotRef}
            type="button"
            onClick={onZoom}
            aria-label={sprintf(
              /* translators: %d: the image's position, 1 to 3 */
              __("View your image %d larger", "structura"),
              n
            )}
            className="focus-visible:ring-brand-500/70 block h-full w-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-inset"
          >
            {view.url && <img src={view.url} alt="" className="h-full w-full object-cover" />}
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              aria-label={sprintf(
                /* translators: %d: the image's position, 1 to 3 */
                __("Remove image %d", "structura"),
                n
              )}
              className="group absolute top-0 right-0 flex size-11 cursor-pointer items-center justify-center outline-none disabled:cursor-not-allowed"
            >
              <span className="group-focus-visible:ring-brand-500 flex size-[30px] items-center justify-center rounded-full bg-white/94 text-neutral-700 shadow-sm ring-1 ring-black/10 transition-colors group-hover:text-red-600 group-focus-visible:ring-2 group-disabled:opacity-60 dark:bg-neutral-900/94 dark:text-neutral-200 dark:ring-white/15 dark:group-hover:text-red-400">
                <X size={15} aria-hidden="true" />
              </span>
            </button>
          )}
        </div>
        {view.fileName && (
          <span className="truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
            {view.fileName}
          </span>
        )}
      </div>
    );
  }

  if (view.kind === "uploading") {
    return (
      <div className="relative aspect-square overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
        <img src={view.previewUrl} alt="" className="h-full w-full object-cover opacity-45" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-white/72 px-3 py-2.5 dark:bg-neutral-900/72">
          {/* The route reports no progress, so the bar runs without a percentage. */}
          <span
            role="status"
            className="text-xs font-semibold text-neutral-800 dark:text-neutral-100"
          >
            {__("Uploading…", "structura")}
          </span>
          <ProgressBar aria-label={__("Uploading…", "structura")} />
        </div>
      </div>
    );
  }

  if (view.kind === "error") {
    const copy = refusalCopy(view.refusal, view.size);
    return (
      <div
        role="alert"
        className="flex aspect-square flex-col items-start justify-between gap-2 overflow-hidden rounded-xl border-[1.5px] border-red-300 bg-red-50 p-3 text-[12.5px] leading-snug text-red-800 dark:border-red-700 dark:bg-red-950/30 dark:text-red-200"
        {...dropProps}
      >
        <CircleAlert
          size={20}
          aria-hidden="true"
          className="shrink-0 text-red-600 dark:text-red-400"
        />
        <p className="m-0! min-h-0">
          <b className="font-bold">{copy.lead}</b> {copy.body}
        </p>
        <Button
          ref={slotRef}
          variant="secondary"
          size="sm"
          onClick={openPicker}
          disabled={disabled}
          className="max-sm:min-h-11"
        >
          {__("Choose another", "structura")}
        </Button>
        {input}
      </div>
    );
  }

  return (
    <div className="aspect-square">
      <button
        ref={slotRef}
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label={sprintf(
          /* translators: %d: the slot's position, 1 to 3 */
          __("Add image (%d of 3)", "structura"),
          n
        )}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        {...dropProps}
        className={cn(
          "flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed px-3 text-center transition-colors outline-none",
          "focus-visible:ring-brand-500/70 focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900",
          "disabled:cursor-not-allowed disabled:opacity-60",
          dragging
            ? "border-brand-400 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10"
            : invalid
              ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/30"
              : "hover:border-brand-300 hover:bg-brand-50/40 dark:hover:border-brand-600 border-neutral-400 bg-neutral-50 dark:border-neutral-500 dark:bg-neutral-800/60"
        )}
      >
        <span
          aria-hidden="true"
          className="bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300 flex size-10 items-center justify-center rounded-xl"
        >
          <ImagePlus size={20} />
        </span>
        <span aria-hidden="true" className="text-[13px] font-bold text-neutral-900 dark:text-white">
          {view.optional ? __("Add another", "structura") : __("Add image", "structura")}
        </span>
        <span aria-hidden="true" className="text-xs text-neutral-500 dark:text-neutral-400">
          {view.optional
            ? __("Optional. Drop it here or browse.", "structura")
            : __("Drop it here or browse.", "structura")}
        </span>
      </button>
      {input}
    </div>
  );
}
