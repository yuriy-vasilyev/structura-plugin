import React, { forwardRef } from "react";
import { BouncingLoader } from "./BouncingLoader";
import { Slot } from "@radix-ui/react-slot";
import { type VariantProps } from "class-variance-authority";
import { cn } from "../utils";
import { buttonVariants } from "../variants/button";

type ButtonBaseProps = VariantProps<typeof buttonVariants> & {
  children: React.ReactNode;
  loading?: boolean;
  className?: string;
  asChild?: boolean;
  disabled?: boolean;
};

export type ButtonProps = ButtonBaseProps &
  (
    | (Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
        href?: never;
        type?: "button" | "submit" | "reset";
      })
    | (React.AnchorHTMLAttributes<HTMLAnchorElement> & {
        href: string;
      })
  );

export const Button = forwardRef<HTMLElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, ...props }, ref) => {
    const calculatedDisabled = loading || props.disabled;
    const commonProps = {
      className: cn(buttonVariants({ variant, size, className })),
      "aria-busy": loading ? true : undefined,
      disabled: calculatedDisabled,
    };

    if (asChild) {
      return (
        <Slot ref={ref} {...commonProps} {...props}>
          {children}
        </Slot>
      );
    }

    // The outer <button> is a flex container with a single direct
    // child (this <span>) — so any `gap-*` class on the button never
    // resolves anywhere visible. The icon and label live INSIDE the
    // span, so the span itself is the real flex parent. We replicate
    // the size-aware gap here; the asChild branch doesn't render this
    // span and instead lets the variant's `gap-*` reach the user's
    // child element directly (see button variants).
    const innerGap =
      size === "sm" ? "gap-1.5" : size === "lg" ? "gap-2.5" : size === "icon" ? "gap-0" : "gap-2";

    const content = (
      <>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="sr-only">Loading...</span>
            <BouncingLoader size={size === "icon" ? "md" : size} />
          </div>
        )}
        <span
          className={cn("inline-flex items-center justify-center transition-opacity", innerGap, {
            "opacity-0": loading,
          })}
        >
          {children}
        </span>
      </>
    );

    if (props.href) {
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          aria-disabled={calculatedDisabled}
          {...commonProps}
          {...props}
        >
          {content}
        </a>
      );
    }

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        {...commonProps}
        {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {content}
      </button>
    );
  }
);
