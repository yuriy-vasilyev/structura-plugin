import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

const bouncingLoaderVariants = cva("flex items-center gap-1.5", {
  variants: {
    size: {
      sm: "gap-1",
      md: "gap-1.5",
      lg: "gap-2",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const dotVariants = cva("block animate-bounce rounded-full bg-current", {
  variants: {
    size: {
      sm: "size-1",
      md: "size-1.5",
      lg: "size-2",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export interface BouncingLoaderProps
  extends VariantProps<typeof bouncingLoaderVariants> {
  label?: string;
  className?: string;
}

export const BouncingLoader = ({
  size,
  label,
  className,
}: BouncingLoaderProps) => {
  return (
    <span className={cn(bouncingLoaderVariants({ size, className }))}>
      <span className={cn(dotVariants({ size }), "[animation-delay:-0.2s]")} />
      <span className={cn(dotVariants({ size }))} />
      <span className={cn(dotVariants({ size }), "[animation-delay:0.2s]")} />
      {label && <span className="ml-1 block text-current">{label}</span>}
    </span>
  );
};
