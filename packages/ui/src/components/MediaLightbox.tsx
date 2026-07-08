import React from "react";
import { Dialog as HeadlessDialog, DialogPanel, Transition } from "@headlessui/react";
import { X } from "lucide-react";
import { cn } from "../utils";

export interface MediaLightboxProps {
  /** Controls visibility. The lightbox is fully unmounted while closed. */
  open: boolean;
  /** Invoked on Esc, backdrop interaction, or the close button. */
  onClose: () => void;
  /** Video source URL (e.g. the signed download URL of a render). */
  src: string;
  /** Optional poster frame shown before playback. */
  poster?: string;
  /**
   * Accessible label for the close button, e.g. `"Close preview"` —
   * required so no English string is baked into the primitive.
   */
  closeLabel: string;
  /**
   * Extra props spread onto the `<video>` element (`preload`, `autoPlay`,
   * `onEnded`, …). `src`, `poster`, and `controls` are owned by the
   * component.
   */
  videoProps?: React.VideoHTMLAttributes<HTMLVideoElement>;
  /** Extra classes for the `<video>` frame (sizing overrides). */
  videoClassName?: string;
  /**
   * Content slot rendered beside the player (right on desktop, below on
   * small screens) — title, meta line, download action, expiry note.
   */
  children?: React.ReactNode;
  /** Extra classes for the content slot wrapper. */
  className?: string;
}

/**
 * MediaLightbox — full-viewport video preview overlay.
 *
 * Video-channel handoff §3 ("Lightbox"): a near-opaque `neutral-950/95`
 * scrim that is intentionally identical in light and dark mode (a lightbox
 * is always a dark room), a 9:16 `<video>` with NATIVE browser controls
 * (decided in the handoff review — no custom scrub/volume chrome), and a
 * side slot for title/meta/actions.
 *
 * Built on HeadlessUI's Dialog — the same machinery as `Dialog.tsx` — so
 * focus trapping, Esc-to-close, scroll locking, portal rendering, and
 * focus restoration to the trigger all come from one audited source.
 * Sits on the modal layer (`z-[100050]`); see Dialog.tsx for the scheme.
 */
export const MediaLightbox = ({
  open,
  onClose,
  src,
  poster,
  closeLabel,
  videoProps,
  videoClassName,
  children,
  className,
}: MediaLightboxProps) => (
  <Transition appear show={open} as={React.Fragment}>
    <HeadlessDialog onClose={onClose} className="relative z-[100050]">
      <Transition.Child
        as={React.Fragment}
        enter="duration-slow ease-out"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="duration-normal ease-in"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        {/* The panel doubles as the scrim: making the full-viewport surface
            the DialogPanel keeps the close button inside the focus trap and
            avoids a second positioning wrapper. */}
        <DialogPanel className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-neutral-950/95 p-4 sm:p-10">
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className={cn(
              "absolute top-5 right-5 flex size-9 items-center justify-center rounded-full",
              "bg-white/10 text-white transition-all duration-fast ease-out hover:bg-white/20",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            )}
          >
            <X className="size-[18px]" aria-hidden="true" />
          </button>

          <div className="flex max-h-full flex-col items-center gap-6 sm:flex-row sm:gap-10">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions
                are burned into the rendered video itself (animated captions
                are the product); no separate track exists. */}
            <video
              controls
              src={src}
              poster={poster}
              className={cn(
                "h-[533px] max-h-[80vh] w-[300px] shrink-0 rounded-2xl bg-neutral-900",
                "object-contain ring-1 ring-white/10",
                videoClassName
              )}
              {...videoProps}
            />
            {children != null && (
              <div className={cn("w-full max-w-[300px] sm:w-auto", className)}>{children}</div>
            )}
          </div>
        </DialogPanel>
      </Transition.Child>
    </HeadlessDialog>
  </Transition>
);
MediaLightbox.displayName = "MediaLightbox";
