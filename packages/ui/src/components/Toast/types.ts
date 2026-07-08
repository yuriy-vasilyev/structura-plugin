export type ToastSeverity =
  | "default"
  | "success"
  | "error"
  | "warning"
  | "info";

export type ToastPlacement =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  message: string;
  title?: string;
  severity?: ToastSeverity;
  duration?: number;
  action?: ToastAction;
  dismissible?: boolean;
}

export interface ToastType {
  id: string;
  title?: string;
  message: string;
  severity: ToastSeverity;
  duration: number;
  action?: ToastAction;
  dismissible: boolean;
}

export interface ToastApi {
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
  successToast: (
    message: string,
    options?: Omit<ToastOptions, "message" | "severity">,
  ) => string;
  errorToast: (
    message: string,
    options?: Omit<ToastOptions, "message" | "severity">,
  ) => string;
  warningToast: (
    message: string,
    options?: Omit<ToastOptions, "message" | "severity">,
  ) => string;
  infoToast: (
    message: string,
    options?: Omit<ToastOptions, "message" | "severity">,
  ) => string;
}

export interface ToastProviderProps {
  children: React.ReactNode;
  placement?: ToastPlacement;
  defaultDuration?: number;
  maxToasts?: number;
  offset?: number;
}
