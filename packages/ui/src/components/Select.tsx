import { Label, Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import React, { createContext, useContext, useMemo } from "react";
import { cn } from "../utils";
import { formFieldLabelVariants, formFieldTriggerVariants } from "../variants/form-field";

type SelectOption = { value: string | number; label: string };
type SelectContextValue = {
  value?: string | number;
  onValueChange: (value: string | number) => void;
  size: "xs" | "sm" | "md";
  options: SelectOption[];
  error?: string;
};

const SelectContext = createContext<SelectContextValue | null>(null);

const useSelectContext = () => {
  const context = useContext(SelectContext);
  if (!context) {
    throw new Error("Select sub-components must be used within a Select provider.");
  }
  return context;
};

interface SelectProps {
  children: React.ReactNode;
  options: SelectOption[];
  value?: string | number;
  onValueChange: (value: string | number) => void;
  disabled?: boolean;
  className?: string;
  size?: "xs" | "sm" | "md";
  error?: string;
}

const SelectRoot: React.FC<SelectProps> = ({
  children,
  options,
  value,
  onValueChange,
  className,
  error,
  disabled = false,
  size = "md",
}) => {
  const contextValue = useMemo(
    () => ({ options, value, onValueChange, size, error }),
    [options, value, onValueChange, size, error]
  );

  return (
    <SelectContext.Provider value={contextValue}>
      <Listbox value={value} onChange={onValueChange} disabled={disabled}>
        <div className={cn("relative", className)}>{children}</div>
      </Listbox>
    </SelectContext.Provider>
  );
};

const SelectLabel = React.forwardRef<
  HTMLLabelElement,
  React.ComponentProps<typeof Label> & {
    hidden?: boolean;
    /**
     * Visual treatment for the label — see `InputFieldProps#labelStyle`.
     * Kept in lockstep with the other form primitives via
     * `variants/form-field.ts#formFieldLabelVariants`.
     */
    labelStyle?: "default" | "prominent";
  }
>(({ className, hidden, labelStyle = "default", ...props }, ref) => {
  return (
    <Label
      ref={ref}
      className={cn(
        formFieldLabelVariants({ labelStyle }),
        { "sr-only": hidden },
        className
      )}
      {...props}
    />
  );
});
SelectLabel.displayName = "SelectLabel";

interface SelectTriggerProps {
  className?: string;
  placeholder?: string;
  /**
   * Interactive adornment rendered inside the trigger row, right of the
   * value and before the chevron — e.g. the voice picker's play-sample
   * circle (video-channel handoff §2).
   *
   * Rendered as a positioned SIBLING of the trigger button, never inside
   * it: nested buttons are invalid HTML and would put the adornment in
   * the trigger's accessible name/tab stop. Clicking it does not open the
   * dropdown. When omitted, the trigger renders exactly as before
   * (back-compat — no wrapper, no padding change).
   */
  trailingAdornment?: React.ReactNode;
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, placeholder = "Select an option...", trailingAdornment }, ref) => {
    const { size, value, options, error } = useSelectContext();
    const selectedOption = options.find((opt) => opt.value === value);

    const button = (
      <ListboxButton
        ref={ref}
        aria-invalid={!!error}
        className={cn(
          formFieldTriggerVariants({
            size,
            intent: error ? "error" : "default",
          }),
          "flex items-center justify-between",
          // Reserve room for the adornment sitting between value and
          // chevron so long labels truncate before sliding under it.
          trailingAdornment != null && "pr-16",
          className
        )}
      >
        {selectedOption ? (
          <span className="truncate">{selectedOption.label}</span>
        ) : (
          <span className="truncate text-gray-400 dark:text-gray-500">{placeholder}</span>
        )}
        <ChevronDown
          className="absolute right-3 size-4 shrink-0 text-gray-400 transition-transform duration-200"
          aria-hidden="true"
        />
      </ListboxButton>
    );

    if (trailingAdornment == null) return button;

    return (
      <div className="relative">
        {button}
        <span className="absolute inset-y-0 right-9 z-10 flex items-center">
          {trailingAdornment}
        </span>
      </div>
    );
  }
);
SelectTrigger.displayName = "SelectTrigger";

const SelectContent: React.FC<
  React.PropsWithChildren<{
    className?: string;
    anchor?: string;
  }>
> = ({ children, className, anchor = "bottom start" }) => {
  const { options } = useSelectContext();
  // Auto-render items from the parent's `options` prop when no
  // explicit children are passed. Several call sites rely on this
  // shorthand — `<Select options={...}><Select.Trigger /><Select.Content /></Select>` —
  // because the options are already declared at the root for the
  // trigger's label resolution; making the consumer repeat them as
  // children was an easy source of "the dropdown is empty" bugs
  // (e.g. the workspace invite-member role picker shipped empty).
  const rendered =
    children ??
    options.map((opt) => (
      <SelectItem key={opt.value} value={opt.value}>
        {opt.label}
      </SelectItem>
    ));
  return (
    <ListboxOptions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      anchor={anchor as any}
      transition
      className={cn(
        // Dropdown panel — rounded-xl, shadow-xl, dark glass-edge.
        // z-[100060] sits above the Dialog modal layer (z-[100050])
        // and the onboarding wizard portal (z-[100000]) so dropdowns
        // are usable both standalone and inside dialogs that open over
        // the full-screen wizard. See Dialog.tsx for the layer scheme.
        "z-[100060] max-h-80! overflow-auto rounded-xl border border-gray-200 bg-white p-1 text-base shadow-xl transition duration-100 ease-in focus:outline-none data-leave:data-closed:opacity-0 sm:text-sm dark:border-gray-800 dark:bg-gray-900 dark:ring-1 dark:ring-white/[0.04]",
        className,
        anchor.includes("top") && "mb-1",
        anchor.includes("bottom") && "mt-1"
      )}
    >
      {rendered}
    </ListboxOptions>
  );
};

interface SelectItemProps {
  value: string | number;
  children: React.ReactNode;
  description?: React.ReactNode;
}

const SelectItem: React.FC<SelectItemProps> = ({ value, children, description }) => {
  return (
    <ListboxOption
      value={value}
      className="group relative cursor-pointer rounded-lg py-2 pr-4 pl-10 text-gray-700 transition-colors select-none data-focus:bg-gray-100 data-focus:text-gray-900 dark:text-gray-300 dark:data-focus:bg-gray-800 dark:data-focus:text-white"
    >
      <div>
        <span className="block truncate font-normal group-data-selected:font-bold group-data-selected:text-brand-600 dark:group-data-selected:text-brand-400">
          {children}
        </span>
        {description && (
          <span className="block text-xs font-normal text-gray-500 group-data-focus:text-gray-600 dark:text-gray-500 dark:group-data-focus:text-gray-400">
            {description}
          </span>
        )}
      </div>
      <span className="invisible absolute inset-y-0 left-0 flex items-center pl-3 text-brand-500 group-data-selected:visible">
        <Check className="size-4 stroke-[3px]" aria-hidden="true" />
      </span>
    </ListboxOption>
  );
};

const SelectError: React.FC<React.PropsWithChildren<{ className?: string }>> = ({
  children,
  className,
}) => {
  if (!children) return null;
  return (
    <p className={cn("mt-1.5 text-xs font-medium text-red-600 dark:text-red-400", className)}>
      {children}
    </p>
  );
};

export const Select = Object.assign(SelectRoot, {
  Trigger: SelectTrigger,
  Content: SelectContent,
  Item: SelectItem,
  Label: SelectLabel,
  Error: SelectError,
});
