import type { FC } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

const spinnerVariants = cva("animate-spin", {
  variants: {
    size: {
      sm: "size-4",
      md: "size-6",
      lg: "size-8",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

interface SpinnerProps extends VariantProps<typeof spinnerVariants> {
  className?: string;
  primaryColorClass?: string;
  secondaryColorClass?: string;
}

export const Spinner: FC<SpinnerProps> = ({
  className,
  size,
  primaryColorClass = "fill-brand-500 dark:fill-brand-400",
  secondaryColorClass = "fill-neutral-200 dark:fill-neutral-700",
}) => {
  return (
    <svg
      className={cn(spinnerVariants({ size, className }))}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20 10C20 15.5228 15.5228 20 10 20C4.47715 20 0 15.5228 0 10C0 4.47715 4.47715 0 10 0C15.5228 0 20 4.47715 20 10ZM1.28988 10C1.28988 14.8105 5.18953 18.7101 10 18.7101C14.8105 18.7101 18.7101 14.8105 18.7101 10C18.7101 5.18953 14.8105 1.28988 10 1.28988C5.18953 1.28988 1.28988 5.18953 1.28988 10Z"
        className={secondaryColorClass}
      />
      <path
        d="M19.3551 10C19.7113 10 20.0022 10.2891 19.9792 10.6445C19.8917 11.9999 19.5287 13.3257 18.9101 14.5399C18.1936 15.946 17.1546 17.1626 15.8779 18.0902C14.6011 19.0178 13.123 19.63 11.5643 19.8769C10.2184 20.0901 8.84535 20.0256 7.52922 19.69C7.18407 19.602 6.99906 19.2359 7.10913 18.8972C7.2192 18.5584 7.58265 18.3755 7.92862 18.4602C9.05034 18.7349 10.2177 18.7842 11.3626 18.6029C12.7202 18.3879 14.0076 17.8546 15.1197 17.0466C16.2317 16.2387 17.1367 15.179 17.7608 13.9543C18.287 12.9215 18.6008 11.796 18.6863 10.6444C18.7126 10.2891 18.9989 10 19.3551 10Z"
        className={primaryColorClass}
      />
    </svg>
  );
};
