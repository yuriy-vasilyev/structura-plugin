import React, { createContext, useContext } from "react";
import {
  Description as HeadlessDescription,
  Dialog as HeadlessDialog,
  DialogPanel,
  DialogTitle,
  Transition,
} from "@headlessui/react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../utils";
import { Button } from "./Button";

const DialogContext = createContext<{ size: "md" | "lg" | "xl" }>({ size: "md" });

/**
 * Dialog — composable modal system.
 *
 * Design guide references:
 * - Section 5.4: Dialogs — frosted glass panel, spring entrance curves
 * - Section 4.1: Elevation Level 3 (Overlay)
 * - Section 3.5 Target: Motion — --duration-slow enter, --duration-normal exit
 */

// --- Main Wrapper ---
const Root = ({
  open,
  onClose,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg" | "xl";
}) => (
  <DialogContext.Provider value={{ size }}>
    <Transition appear show={open} as={React.Fragment}>
      {/* Modal layer. The full-screen onboarding wizard portals to
          document.body at z-[100000] (it must clear wp-admin's
          #wpadminbar at 99999). HeadlessUI dialogs also portal to
          body, so they compete on raw z-index — z-50 left them
          stranded behind the wizard. Sit dialogs just above it; the
          dropdown layer (Select.Content) sits above dialogs in turn
          so in-dialog selects stay usable. */}
      <HeadlessDialog onClose={onClose} className="relative z-[100050]">
        {/* Overlay — design guide 5.4: --ease-out enter (400ms), --ease-in exit (250ms) */}
        <Transition.Child
          as={React.Fragment}
          enter="duration-slow ease-out"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="duration-normal ease-in"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 bg-neutral-900/40 backdrop-blur-md"
            aria-hidden="true"
          />
        </Transition.Child>

        <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
          {children}
        </div>
      </HeadlessDialog>
    </Transition>
  </DialogContext.Provider>
);
Root.displayName = "Dialog.Root";

const Trigger = React.forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>(
  (props, ref) => <Button ref={ref} {...props} />
);
Trigger.displayName = "Dialog.Trigger";

const Content = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const { size } = useContext(DialogContext);
    return (
      // Panel entrance — design guide 5.4: --duration-slow (400ms) --ease-out enter
      <Transition.Child
        as={React.Fragment}
        enter="duration-slow ease-out"
        enterFrom="opacity-0 scale-95 translate-y-4 sm:translate-y-0"
        enterTo="opacity-100 scale-100 translate-y-0"
        leave="duration-normal ease-in"
        leaveFrom="opacity-100 scale-100 translate-y-0"
        leaveTo="opacity-0 scale-95 translate-y-4 sm:translate-y-0"
      >
        <DialogPanel
          ref={ref}
          className={cn(
            // Frosted glass panel — design guide 5.4 target
            "relative transform overflow-hidden rounded-2xl border p-6 text-left",
            "border-neutral-200 bg-white/95 backdrop-blur-xl",
            // Elevation Level 3 — overlay shadow
            "shadow-[0_8px_16px_-4px_rgba(0,0,0,0.08),0_24px_48px_-8px_rgba(0,0,0,0.16)]",
            "transition-all",
            // Dark mode — frosted glass + glass-edge highlight
            "dark:border-neutral-700 dark:bg-neutral-800/95 dark:backdrop-blur-xl",
            "dark:ring-1 dark:ring-white/[0.08] dark:shadow-2xl dark:shadow-black/40",
            {
              "w-full max-w-md": size === "md",
              "w-full max-w-2xl": size === "lg",
              "w-full max-w-4xl": size === "xl",
            },
            className
          )}
          {...props}
        >
          {children}
        </DialogPanel>
      </Transition.Child>
    );
  }
);
Content.displayName = "Dialog.Content";

const Header = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mb-5 text-center sm:text-left", className)} {...props} />
);
Header.displayName = "Dialog.Header";

const Title = React.forwardRef<HTMLHeadingElement, React.ComponentProps<typeof DialogTitle>>(
  ({ className, ...props }, ref) => (
    <DialogTitle
      ref={ref}
      className={cn(
        "font-display m-0! text-xl leading-6 font-bold tracking-tight text-neutral-900 dark:text-white",
        className
      )}
      {...props}
    />
  )
);
Title.displayName = "Dialog.Title";

const Description = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentProps<typeof HeadlessDescription>
>(({ className, ...props }, ref) => (
  <HeadlessDescription
    ref={ref}
    className={cn("mt-2 mb-0! text-sm text-neutral-500 dark:text-neutral-400", className)}
    {...props}
  />
));
Description.displayName = "Dialog.Description";

const Body = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-4", className)} {...props} />
);
Body.displayName = "Dialog.Body";

const Footer = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);
Footer.displayName = "Dialog.Footer";

const Close = React.forwardRef<HTMLButtonElement, React.ComponentProps<typeof Slot>>(
  ({ ...props }, ref) => <Slot ref={ref} {...props} />
);
Close.displayName = "Dialog.Close";

export const Dialog = {
  Root,
  Trigger,
  Content,
  Header,
  Title,
  Description,
  Body,
  Footer,
  Close,
};
