/**
 * The zoom dialog of the character sheet and the customer's images
 * (recurring-character handoff §6.1): one image large, a strip to switch,
 * arrow keys from anywhere in the dialog. Built on `Dialog`, which gives the
 * focus trap, Escape, scroll lock and focus return to the image that opened
 * it. Full screen on phones.
 */
import { useEffect, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button, Dialog, cn } from "@structura/ui";

/** One image the dialog can show. */
export interface ZoomItem {
  key: string;
  /** Null when the cloud could not sign the image's URL. */
  src: string | null;
  /** The same alt text as on the page. */
  alt: string;
  /** Dialog title while this image shows. */
  title: string;
  /** Accessible name of its thumbnail, and what the switch announces. */
  label: string;
  /** The sheet is 3:2, the customer's images are square. */
  shape: "sheet" | "square";
}

/** Props for {@link ZoomDialog}. */
export interface ZoomDialogProps {
  items: ZoomItem[];
  open: boolean;
  /** The image shown; kept while the dialog closes. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** The dialog; open while `open` is set and there is an image to show. */
export function ZoomDialog({
  items,
  open: requested,
  index,
  onIndexChange,
  onClose,
}: ZoomDialogProps) {
  // Spoken only after a switch, not when the dialog opens (its title is read then).
  const [switched, setSwitched] = useState(false);
  const open = requested && items.length > 0;
  const current = Math.min(index, Math.max(items.length - 1, 0));
  const item = items[current];
  const total = items.length;

  const go = (next: number) => {
    setSwitched(true);
    onIndexChange((next + total) % total);
  };
  const close = () => {
    setSwitched(false);
    onClose();
  };

  // On the document, not the panel: right after opening, focus can still be
  // on its way into the dialog, and the keys must work from anywhere in it.
  // The dialog is modal, so nothing else on the page takes keys meanwhile.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Headless UI drops an Escape pressed while the panel is still
      // entering; the dialog's own contract is that Escape always closes.
      if (event.key === "Escape") {
        setSwitched(false);
        onClose();
        return;
      }
      const target =
        event.key === "ArrowRight"
          ? current + 1
          : event.key === "ArrowLeft"
            ? current - 1
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? total - 1
                : null;
      if (target === null) return;
      event.preventDefault();
      setSwitched(true);
      onIndexChange((target + total) % total);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, current, total, onIndexChange, onClose]);

  return (
    <Dialog.Root open={open} onClose={close} size="xl">
      <Dialog.Content className="flex flex-col max-sm:fixed max-sm:inset-0 max-sm:h-dvh max-sm:max-w-none max-sm:rounded-none max-sm:border-0 max-sm:p-4">
        {item && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {/* wp-admin colours every h2 #1d2327 outside any layer, which a plain colour class loses to. */}
                <Dialog.Title className="max-sm:text-[17px]">
                  {item.title}
                </Dialog.Title>
                <p className="mt-1! mb-0! text-[13px] text-neutral-500 dark:text-neutral-400">
                  {sprintf(
                    /* translators: 1: the image's position, 2: how many images there are */
                    __("%1$d of %2$d", "structura"),
                    current + 1,
                    total
                  )}
                </p>
              </div>
              <Button
                variant="transparent"
                size="icon"
                onClick={close}
                aria-label={__("Close", "structura")}
                className="size-11 shrink-0"
              >
                <X size={20} aria-hidden="true" />
              </Button>
            </div>

            <div className="mt-4! flex h-[520px] items-center justify-center overflow-hidden rounded-xl bg-neutral-50 max-sm:h-auto max-sm:min-h-0 max-sm:flex-1 dark:bg-neutral-900/60">
              {item.src && (
                <img
                  src={item.src}
                  alt={item.alt}
                  className="max-h-full max-w-full object-contain"
                />
              )}
            </div>

            <div className="mt-4! flex items-center gap-2">
              <Button
                variant="secondary"
                size="icon"
                onClick={() => go(current - 1)}
                aria-label={__("Previous image", "structura")}
                className="size-11 shrink-0"
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </Button>
              <div
                role="group"
                aria-label={__("Images to compare", "structura")}
                className="flex min-w-0 flex-1 gap-2 overflow-x-auto p-1 sm:justify-center"
              >
                {items.map((thumb, i) => (
                  <button
                    key={thumb.key}
                    type="button"
                    aria-label={thumb.label}
                    aria-current={i === current ? "true" : undefined}
                    onClick={() => go(i)}
                    className={cn(
                      "shrink-0 cursor-pointer overflow-hidden rounded-lg bg-neutral-100 outline-none dark:bg-neutral-800",
                      "focus-visible:ring-brand-500/70 focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-800",
                      thumb.shape === "sheet"
                        ? "h-12 w-[72px] max-sm:h-14 max-sm:w-[84px]"
                        : "size-12 max-sm:size-14",
                      i === current &&
                        "ring-brand-500 ring-2 ring-offset-2 dark:ring-offset-neutral-800"
                    )}
                  >
                    {thumb.src && (
                      <img src={thumb.src} alt="" className="h-full w-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => go(current + 1)}
                aria-label={__("Next image", "structura")}
                className="size-11 shrink-0"
              >
                <ChevronRight size={20} aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-3! mb-0! text-center text-xs text-neutral-500 max-sm:hidden dark:text-neutral-400">
              {__("Left and right arrow keys switch images. Escape closes.", "structura")}
            </p>
            <div role="status" aria-live="polite" className="sr-only">
              {switched
                ? sprintf(
                    /* translators: 1: an image's name, e.g. "Your image 2", 2: its position, 3: how many images there are */
                    __("Showing %1$s, %2$d of %3$d", "structura"),
                    item.label,
                    current + 1,
                    total
                  )
                : ""}
            </div>
          </>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
