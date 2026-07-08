import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "../utils";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  variant?: "danger" | "primary";
  /** Panel width, forwarded to `Dialog.Root`. Defaults to "md". */
  size?: "md" | "lg" | "xl";
  /**
   * Optional richer body rendered under the description — e.g. a list of
   * exactly what a destructive action will remove. Keeps the standard
   * icon + title + description + footer layout intact.
   */
  children?: React.ReactNode;
  loading?: boolean;
  confirmButtonProps?: {
    label?: string;
    variant?: "danger" | "primary" | "secondary" | "accent";
    icon?: React.ReactNode;
  };
  cancelButtonProps?: {
    label?: string;
  };
}

/**
 * ConfirmDialog — pre-composed confirmation modal.
 *
 * Wraps Dialog with a standard icon + title + description + footer layout.
 */
export const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  variant = "primary",
  size = "md",
  children,
  loading = false,
  confirmButtonProps = {},
  cancelButtonProps = {},
}: ConfirmDialogProps) => {
  const Icon = variant === "danger" ? AlertTriangle : ShieldCheck;

  const confirmLabel = confirmButtonProps.label || "Confirm";
  const confirmVariant =
    confirmButtonProps.variant || (variant === "danger" ? "danger" : "primary");
  const cancelLabel = cancelButtonProps.label || "Cancel";

  return (
    <Dialog.Root open={isOpen} onClose={onClose} size={size}>
      <Dialog.Content>
        <div className="flex gap-4">
          <div
            className={cn(
              "mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full sm:mx-0",
              variant === "danger"
                ? "bg-red-50 dark:bg-red-900/20"
                : "bg-emerald-50 dark:bg-emerald-900/20"
            )}
          >
            <Icon
              className={cn(
                "h-6 w-6",
                variant === "danger"
                  ? "text-red-600 dark:text-red-400"
                  : "text-emerald-600 dark:text-emerald-400"
              )}
              aria-hidden="true"
            />
          </div>
          <div className="grow">
            <Dialog.Header className="mb-2 text-left">
              <Dialog.Title>{title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description>{description}</Dialog.Description>
            {children}
          </div>
        </div>
        <Dialog.Footer>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmButtonProps.icon && <span className="mr-2">{confirmButtonProps.icon}</span>}
            {loading ? "Loading..." : confirmLabel}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};
