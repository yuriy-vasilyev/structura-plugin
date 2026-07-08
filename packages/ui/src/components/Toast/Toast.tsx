import { memo, useCallback, useEffect, useState } from "react";
import type { ToastType } from "./types";
import { toastIconColors, toastVariants } from "../../variants/toast";
import { cn } from "../../utils";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

// Lucide Icon Mapping
const Icons = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  default: Info,
};

type ToastProps = ToastType & {
  onDismiss: (id: string) => void;
};

const ANIMATION_DURATION = 300; // in ms

export const Toast = memo(function Toast({
  id,
  title,
  message,
  severity = "default", // Defaulting to avoid undefined
  duration,
  action,
  dismissible,
  onDismiss,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => onDismiss(id), ANIMATION_DURATION);
  }, [id, onDismiss]);

  useEffect(() => {
    // Trigger animation on mount
    const animationTimer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(animationTimer);
  }, []);

  useEffect(() => {
    if (isPaused || !duration) {
      // Check if duration exists
      if (timeoutId) {
        clearTimeout(timeoutId);
        setTimeoutId(null);
      }
      return;
    }

    const timer = setTimeout(() => {
      handleDismiss();
    }, duration);

    setTimeoutId(timer);

    return () => {
      clearTimeout(timer);
    };
  }, [id, duration, handleDismiss, isPaused]);

  const IconComponent = Icons[severity] || Icons.default;

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={cn(
        toastVariants({ intent: severity }),
        isVisible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
      )}
    >
      {/* Icon */}
      <div className={cn("mt-0.5 shrink-0", toastIconColors[severity])}>
        <IconComponent size={20} strokeWidth={2.5} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {title && <div className="mb-1 text-sm leading-tight font-bold">{title}</div>}
        <div className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          {message}
        </div>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-3 cursor-pointer text-xs font-bold tracking-wide text-neutral-900 uppercase hover:underline focus-visible:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)] rounded dark:text-white"
          >
            {action.label}
          </button>
        )}
      </div>

      {/* Close button */}
      {dismissible && (
        <button
          aria-label="Close"
          onClick={handleDismiss}
          className="-mt-1 -mr-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-neutral-400 transition-all duration-fast ease-out hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)] dark:hover:bg-neutral-800 dark:hover:text-white"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
});
