import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Field, Label, Switch as HeadlessSwitch } from "@headlessui/react";
import { cn } from "../utils";
import { switchVariants } from "../variants/switch";

/**
 * The `<button>` Headless UI's `Switch` renders, joining the ids it computes
 * from the field's own descriptions with the ones the caller passed as
 * `aria-describedby`. Headless UI's own value would otherwise replace the
 * caller's: it is set even when the field has no description, as
 * `undefined`. Same fix as `DescribedInput` in InputField.
 */
const DescribedButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { extraDescribedBy?: string }
>(({ extraDescribedBy, "aria-describedby": fieldDescribedBy, ...props }, ref) => {
  const describedBy = [fieldDescribedBy, extraDescribedBy].filter(Boolean).join(" ");
  return <button ref={ref} aria-describedby={describedBy || undefined} {...props} />;
});
DescribedButton.displayName = "DescribedButton";

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hiddenLabel?: boolean;
  className?: string;
  description?: string;
  disabled?: boolean;
  /** Ids of text outside the Switch that describes it, such as a hint beside a hidden label. */
  "aria-describedby"?: string;
}

/**
 * Switch — toggle control with label + description.
 *
 * Design guide references:
 * - Section 3.5 Target: Motion — spring overshoot on thumb (--ease-spring)
 * - Section 6.1: Border Radius — rounded-full for switch track and thumb
 */
export const Switch = forwardRef<HTMLDivElement, SwitchProps>(
  (
    {
      label,
      hiddenLabel,
      checked,
      onChange,
      className,
      description,
      disabled,
      "aria-describedby": callerDescribedBy,
      ...props
    },
    ref
  ) => {
    return (
      <div ref={ref}>
        <Field className={cn("flex items-start justify-between gap-4", className)}>
          <div className="flex flex-col">
            <Label
              className={cn(
                "mt-0.5 cursor-pointer text-sm font-medium text-gray-700 select-none dark:text-gray-200",
                disabled && "cursor-not-allowed opacity-50",
                hiddenLabel && "sr-only"
              )}
            >
              {label}
            </Label>
            {description && (
              <p
                className={cn(
                  "text-xs text-gray-500 select-none dark:text-gray-400",
                  disabled && "opacity-50"
                )}
              >
                {description}
              </p>
            )}
          </div>

          <HeadlessSwitch
            as={DescribedButton}
            extraDescribedBy={callerDescribedBy}
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            className={cn("group", switchVariants())}
            {...props}
          >
            {/* Thumb — spring overshoot transition (design guide 3.5). The track's
                2px border is the gap on both sides, so off sits at 0 and on at
                the far end of the 36px inside (20px + the 16px thumb). */}
            <span
              aria-hidden="true"
              className="pointer-events-none inline-block size-4 translate-x-0 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-normal ease-spring group-data-checked:translate-x-5!"
            />
          </HeadlessSwitch>
        </Field>
      </div>
    );
  }
);

Switch.displayName = "Switch";
