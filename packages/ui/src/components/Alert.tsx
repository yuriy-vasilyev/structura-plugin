import React from "react";
import { X } from "lucide-react";
import { type VariantProps } from "class-variance-authority";
import { cn } from "../utils";
import { alert } from "../variants/alert";

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof alert> {
  /**
   * Render an integrated × close button in the top-right corner.
   * The handler fires on click. Title/description automatically
   * get extra right-padding so they don't collide with the button.
   *
   * Adding the close button at the component level — rather than
   * letting each call site hand-roll an absolutely-positioned
   * `<button>` — keeps focus styles, hit target size, and
   * dark-mode colours consistent across every alert in the app.
   */
  onDismiss?: () => void;
  /**
   * Accessible label for the close button. Defaults to `"Dismiss"`
   * for back-compat with non-localized callers; pass a translated
   * string from `__("Dismiss", "structura")` in production code.
   */
  dismissLabel?: string;
}

const AlertRoot = React.forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      className,
      variant,
      onDismiss,
      dismissLabel = "Dismiss",
      children,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alert({ variant }), onDismiss && "pr-12", className)}
      {...props}
    >
      {children}
      {onDismiss && (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className={cn(
            // `absolute` removes the close button from the alert
            // grid flow so it doesn't push the icon column open.
            "absolute right-2 top-2 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md",
            "text-current opacity-60 transition-opacity",
            "hover:opacity-100",
            "focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current",
          )}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  ),
);
AlertRoot.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn(
      "mt-0! mb-1! text-base! leading-none font-bold tracking-tight text-neutral-900 dark:text-white",
      className,
    )}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

const AlertAction = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("mt-4", className)} {...props} />
));
AlertAction.displayName = "AlertAction";

export const Alert = Object.assign(AlertRoot, {
  Title: AlertTitle,
  Description: AlertDescription,
  Action: AlertAction,
});
