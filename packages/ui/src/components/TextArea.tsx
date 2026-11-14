import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Description, Field, Label, Textarea } from "@headlessui/react";
import { Spinner } from "./Spinner";
import { cn } from "../utils";
import {
  formFieldElementVariants,
  formFieldGroupVariants,
  formFieldLabelRowVariants,
  formFieldLabelVariants,
  formFieldDescriptionVariants,
} from "../variants/form-field";

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string;
  error?: string;
  hiddenLabel?: boolean;
  loading?: boolean;
  leftAdornment?: ReactNode;
  rightAdornment?: ReactNode;
  size?: "xs" | "sm" | "md";
  /**
   * Visual treatment for the label — see `InputFieldProps#labelStyle`.
   * Kept in lockstep with the other form primitives via
   * `variants/form-field.ts#formFieldLabelVariants`.
   */
  labelStyle?: "default" | "prominent";
  /**
   * Help line under the control. A Headless UI `Description`, so it joins
   * the error in the control's `aria-describedby`.
   */
  description?: string;
  /**
   * Shown after the label text, e.g. a "Drafted" badge. Sits beside the
   * `<label>`, not in it, so the field's accessible name stays `label`.
   */
  labelAdornment?: ReactNode;
  /**
   * Live length readout under the control's right edge, e.g. "1,234 / 3,000".
   * The caller formats `text` in the page's language; `over` shows it in the
   * error tone. A Headless UI `Description`, so it joins the error and the
   * help line in the control's `aria-describedby`.
   */
  counter?: { text: string; over?: boolean };
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  (
    {
      label,
      required,
      hiddenLabel,
      error,
      loading,
      leftAdornment,
      rightAdornment,
      className,
      rows,
      size = "md",
      labelStyle = "default",
      description,
      labelAdornment,
      counter,
      ...rest
    },
    ref
  ) => {
    const elementClassName = cn(formFieldElementVariants({ size }), "resize-none leading-relaxed!");
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

    const messages = (
      <>
        {/* Same error treatment as InputField: shared variant, dark tone, announced.
         *  The old text-sm red-600 had no dark tone, 3.96:1 on dark cards
         *  (2026-11-08 contrast audit). */}
        {error && (
          <Description role="alert" className={formFieldDescriptionVariants({ intent: "error" })}>
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
      </>
    );

    return (
      <Field
        as="div"
        disabled={rest.disabled || loading}
        // Field renders a div, which `:disabled` never matches; it sets data-disabled.
        className={cn("w-full data-disabled:opacity-50", className)}
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
          className={formFieldGroupVariants({
            intent: error ? "error" : "default",
          })}
        >
          {leftAdornment && (
            <div
              className={cn("flex items-start", {
                "py-1 pr-1 pl-1.5 text-xs": size === "xs",
                "py-1.5 pr-1.5 pl-2 text-sm": size === "sm",
                "py-2.5 pr-2 pl-3 text-sm": size === "md",
              })}
            >
              {leftAdornment}
            </div>
          )}

          <Textarea ref={ref} {...rest} rows={rows} className={elementClassName} />

          {loading && (
            <div
              className={cn("flex items-center", {
                "px-1.5": size === "xs",
                "px-2": size === "sm",
                "px-3": size === "md",
              })}
            >
              <Spinner />
            </div>
          )}
          {rightAdornment && !loading && (
            <div
              className={cn("flex items-start", {
                "py-1 pr-1.5 pl-1 text-xs": size === "xs",
                "py-1.5 pr-2 pl-1.5 text-sm": size === "sm",
                "py-2.5 pr-3 pl-2 text-sm": size === "md",
              })}
            >
              {rightAdornment}
            </div>
          )}
        </div>

        {counter ? (
          // The count shares the messages' row, at the control's right edge.
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">{messages}</div>
            <Description
              as="div"
              className={cn(
                formFieldDescriptionVariants({ intent: counter.over ? "error" : "default" }),
                "shrink-0 tabular-nums"
              )}
            >
              {counter.text}
            </Description>
          </div>
        ) : (
          messages
        )}
      </Field>
    );
  }
);

TextArea.displayName = "TextArea";
