import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ToastContainer } from "./toast-container";
import type {
  ToastApi,
  ToastOptions,
  ToastProviderProps,
  ToastType,
} from "./types";
import { generateRandomId } from "../../utils";
import { toastEmitter } from "./toast.api";

export const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION = 5000;
const DEFAULT_MAX_TOASTS = 5;
const DEFAULT_OFFSET = 4;

export function ToastProvider({
  children,
  placement = "top-right",
  defaultDuration = DEFAULT_DURATION,
  maxToasts = DEFAULT_MAX_TOASTS,
  offset = DEFAULT_OFFSET,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastType[]>([]);

  const show = useCallback(
    (options: ToastOptions): string => {
      const id = generateRandomId();
      const newToast: ToastType = {
        id,
        title: options.title,
        message: options.message,
        severity: options.severity ?? "default",
        duration: options.duration ?? defaultDuration,
        action: options.action,
        dismissible: options.dismissible ?? true,
      };

      setToasts((prevToasts) => {
        const updatedToasts =
          prevToasts.length >= maxToasts ? prevToasts.slice(1) : prevToasts;

        return [...updatedToasts, newToast];
      });

      return id;
    },
    [defaultDuration, maxToasts],
  );

  useEffect(() => {
    const handleShow = (options: ToastOptions) => {
      show(options);
    };

    toastEmitter.on(handleShow);

    return () => {
      toastEmitter.off(handleShow);
    };
  }, [show]);

  const dismiss = useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      showToast: show,
      dismissToast: dismiss,
      successToast: (message, options) =>
        show({ ...options, message, severity: "success" }),
      errorToast: (message, options) =>
        show({ ...options, message, severity: "error" }),
      warningToast: (message, options) =>
        show({ ...options, message, severity: "warning" }),
      infoToast: (message, options) =>
        show({ ...options, message, severity: "info" }),
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <ToastContainer
            toasts={toasts}
            onDismiss={dismiss}
            placement={placement}
            offset={offset}
          />,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
