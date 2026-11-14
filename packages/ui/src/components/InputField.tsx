import { forwardRef, type InputHTMLAttributes, ReactNode, useState } from "react";
import { Description, Field, Input, Label } from "@headlessui/react";
import { Spinner } from "./Spinner";
import { cn } from "../utils";
import {
  formFieldDescriptionVariants,
  formFieldElementVariants,
  formFieldGroupVariants,
  formFieldLabelRowVariants,
  formFieldLabelVariants,
  leftAdornmentVariants,
  rightAdornmentVariants,
} from "../variants/form-field";

/**
 * The `<input>` Headless UI's `Input` renders, joining the ids it computes
 * from the field's own descriptions (the error message) with the ones the
 * caller passed as `aria-describedby` (a hint rendered outside the field).
 * Headless UI's own value would otherwise replace the caller's: it is set
 * even when the field has no description, as `undefined`.
 */
const DescribedInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { extraDescribedBy?: string }
>(({ extraDescribedBy, "aria-describedby": fieldDescribedBy, ...props }, ref) => {
  const describedBy = [fieldDescribedBy, extraDescribedBy].filter(Boolean).join(" ");
  return <input ref={ref} aria-describedby={describedBy || undefined} {...props} />;
});
DescribedInput.displayName = "DescribedInput";

/**
 * Props for the InputField component.
 * It omits 'id' from the standard HTML attributes because Headless UI
 * automatically generates it for accessibility between the Label and Input.
 */
export interface InputFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  size?: "xs" | "sm" | "md";
  error?: string;
  hiddenLabel?: boolean;
  loading?: boolean;
  errorView?: "default" | "tooltip";
  leftAdornment?: ReactNode;
  rightAdornment?: ReactNode;
  inputClassName?: string;
  /**
   * Visual treatment for the label.
   * - `"default"` (wp-admin / portal) — tiny uppercase eyebrow.
   * - `"prominent"` (marketing / www) — full `text-sm font-bold` heading.
   *
   * See `variants/form-field.ts#formFieldLabelVariants` for the tokens.
   */
  labelStyle?: "default" | "prominent";
  /**
   * Hint under the control. A Headless UI `Description`, so it joins the
   * error, and any `aria-describedby` you pass, in the control's
   * description. Stays visible whatever `errorView` is.
   */
  description?: string;
  /**
   * Shown after the label text, e.g. a "Drafted" badge. Sits beside the
   * `<label>`, not in it, so the field's accessible name stays `label`.
   */
  labelAdornment?: ReactNode;
  /**
   * Marks the control `aria-invalid` when its error is shown outside the
   * field (the voice link row puts it beside a counter). Headless UI's
   * `Input` owns that attribute, so it cannot be passed as `aria-invalid`.
   */
  invalid?: boolean;
}

const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  (
    {
      label,
      id,
      required,
      hiddenLabel,
      error,
      errorView = "default",
      loading,
      size = "md",
      type = "text",
      leftAdornment,
      rightAdornment,
      className,
      inputClassName,
      labelStyle = "default",
      description,
      labelAdornment,
      "aria-describedby": callerDescribedBy,
      ...rest
    },
    ref
  ) => {
    const [isFocused, setFocused] = useState(false);
    const labelElement = (
      <Label
        className={cn(formFieldLabelVariants({ labelStyle }), {
          "mb-0": labelAdornment != null,
          "sr-only": hiddenLabel,
        })}
      >
        {required ? `${label} *` : label}
      </Label>
    );

    // Determine the view variant for the description
    const descriptionView =
      !error || (errorView !== "default" && errorView !== "tooltip") ? "hidden" : errorView;

    return (
      <Field
        as="div"
        disabled={rest.disabled}
        // Field renders a div, which `:disabled` never matches; it sets data-disabled.
        className={"group/field relative data-disabled:opacity-40"}
      >
        {labelAdornment != null ? (
          <div className={formFieldLabelRowVariants({ labelStyle })}>
            {labelElement}
            {labelAdornment}
          </div>
        ) : (
          labelElement
        )}

        <div
          className={cn(
            formFieldGroupVariants({
              intent: error ? "error" : "default",
            }),
            className
          )}
        >
          {leftAdornment && <div className={leftAdornmentVariants({ size })}>{leftAdornment}</div>}

          <Input
            as={DescribedInput}
            extraDescribedBy={callerDescribedBy}
            id={id}
            ref={ref}
            type={type}
            className={cn(formFieldElementVariants({ size }), inputClassName)}
            onFocus={(e) => {
              setFocused(true);
              rest.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              rest.onBlur?.(e);
            }}
            {...rest}
          />

          {loading && (
            <div className="flex items-center px-3">
              <Spinner />
            </div>
          )}

          {rightAdornment && !loading && (
            <div className={rightAdornmentVariants({ size })}>{rightAdornment}</div>
          )}
        </div>

        {error && (
          <Description
            // role="alert" so assistive tech announces the message the moment
            // it appears (validation convention, design guide §5.2 error intent).
            role="alert"
            className={cn(
              formFieldDescriptionVariants({
                intent: "error",
                view: descriptionView,
              }),
              errorView === "tooltip" && isFocused && "block!"
            )}
          >
            {error}
          </Description>
        )}
        {/* A div, not Headless UI's default <p>: wp-admin's common.css gives
         *  every p its own margin and font size. */}
        {description && (
          <Description as="div" className={formFieldDescriptionVariants({ intent: "default" })}>
            {description}
          </Description>
        )}
      </Field>
    );
  }
);

InputField.displayName = "InputField";
export { InputField };
