import { forwardRef, type InputHTMLAttributes } from "react";
import { Checkbox as HeadlessCheckbox, Field, Label } from "@headlessui/react";
import { Check } from "lucide-react";
import { cn } from "../utils";
import { checkboxVariants } from "../variants/checkbox";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value"
> {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hiddenLabel?: boolean;
  className?: string;
  description?: string;
}

export const Checkbox = forwardRef<HTMLDivElement, CheckboxProps>(
  ({ label, hiddenLabel, checked, onChange, className, description, ...props }, ref) => {
    return (
      <div ref={ref}>
        <Field className={cn("flex items-start gap-3", className)}>
          <div className="flex h-6 cursor-pointer items-center">
            <HeadlessCheckbox
              checked={checked}
              onChange={onChange}
              {...props}
              className={cn("group/checkbox", checkboxVariants())}
            >
              <Check
                strokeWidth={3}
                className="size-3.5 text-white opacity-0 group-data-checked/checkbox:opacity-100"
              />
            </HeadlessCheckbox>
          </div>
          <div className="flex flex-col">
            <Label
              className={cn(
                "mt-0.5 cursor-pointer text-sm font-medium text-gray-700 select-none group-data-disabled:opacity-50 dark:text-gray-200",
                hiddenLabel && "sr-only"
              )}
            >
              {label}
            </Label>
            {description && (
              <p className="text-xs text-gray-500 select-none group-data-disabled:opacity-50 dark:text-gray-400">
                {description}
              </p>
            )}
          </div>
        </Field>
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";
