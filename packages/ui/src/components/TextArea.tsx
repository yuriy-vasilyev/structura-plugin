import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Description, Field, Label, Textarea } from "@headlessui/react";
import { Spinner } from "./Spinner";
import { cn } from "../utils";
import {
  formFieldElementVariants,
  formFieldGroupVariants,
  formFieldLabelVariants,
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
      ...rest
    },
    ref
  ) => {
    const elementClassName = cn(formFieldElementVariants({ size }), "resize-none leading-relaxed!");

    return (
      <Field
        as="div"
        disabled={rest.disabled || loading}
        className={cn("w-full disabled:opacity-50", className)}
      >
        <Label
          className={cn(formFieldLabelVariants({ labelStyle }), {
            "sr-only": hiddenLabel,
          })}
        >
          {required ? `${label} *` : label}
        </Label>

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

        {error && <Description className="mt-2 text-sm text-red-600">{error}</Description>}
      </Field>
    );
  }
);

TextArea.displayName = "TextArea";
