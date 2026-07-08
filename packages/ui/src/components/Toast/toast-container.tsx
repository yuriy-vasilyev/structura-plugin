import { Toast } from "./Toast";
import type { ToastPlacement, ToastType } from "./types";
import { cn } from "../../utils";

interface ToastContainerProps {
  toasts: ToastType[];
  onDismiss: (id: string) => void;
  placement: ToastPlacement;
  offset?: number;
}

const getPlacementClasses = (placement: ToastPlacement): string => {
  const placementMap: Record<ToastPlacement, string> = {
    "top-left": "top-8 left-0",
    "top-center": "top-8 left-1/2 -translate-x-1/2",
    "top-right": "top-8 right-0",
    "bottom-left": "bottom-0 left-0",
    "bottom-center": "bottom-0 left-1/2 -translate-x-1/2",
    "bottom-right": "bottom-0 right-0",
  };

  return placementMap[placement];
};

export function ToastContainer({ toasts, onDismiss, placement, offset = 4 }: ToastContainerProps) {
  // Don't render anything if there are no toasts
  if (toasts.length === 0) {
    return null;
  }

  // Calculate inline styles for the gap/padding based on the offset prop
  // Note: We use padding on the container instead of top/left/right properties
  // to avoid conflicting with the placement classes and ensure smooth stacking.
  const containerStyle = {
    padding: `${offset * 0.25}rem`,
  };

  return (
    <div
      aria-live="assertive"
      aria-atomic="false"
      className={cn(
        "pointer-events-none fixed z-100 flex w-full max-w-105 flex-col gap-3", // pointer-events-none lets clicks pass through gaps
        getPlacementClasses(placement),
        placement.includes("bottom") ? "flex-col-reverse" : "flex-col" // Stack direction
      )}
      style={containerStyle}
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
