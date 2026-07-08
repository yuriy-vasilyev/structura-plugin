import type { ToastOptions } from "./types";

type ToastListener = (options: ToastOptions) => void;

class Emitter {
  private listeners: ToastListener[] = [];

  on = (listener: ToastListener) => {
    this.listeners.push(listener);
  };

  off = (listener: ToastListener) => {
    this.listeners = this.listeners.filter((l) => l !== listener);
  };

  emit = (options: ToastOptions) => {
    this.listeners.forEach((listener) => listener(options));
  };
}

const emitter = new Emitter();

export const toast = {
  show: (options: ToastOptions) => emitter.emit(options),
  success: (
    message: ToastOptions["message"],
    options?: Omit<ToastOptions, "message" | "severity">,
  ) => emitter.emit({ ...options, message, severity: "success" }),
  error: (
    message: ToastOptions["message"],
    options?: Omit<ToastOptions, "message" | "severity">,
  ) => emitter.emit({ ...options, message, severity: "error" }),
  warning: (
    message: ToastOptions["message"],
    options?: Omit<ToastOptions, "message" | "severity">,
  ) => emitter.emit({ ...options, message, severity: "warning" }),
  info: (
    message: ToastOptions["message"],
    options?: Omit<ToastOptions, "message" | "severity">,
  ) => emitter.emit({ ...options, message, severity: "info" }),
};

export const toastEmitter = emitter;
