import React, { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, Check, Copy, LifeBuoy, RotateCcw } from "lucide-react";
import { __ } from "@wordpress/i18n";
import { Button, cn } from "@structura/ui";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, copied: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Structura Critical Error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleCopyError = async () => {
    const errorText = `Error: ${this.state.error?.toString()}\n\nStack:\n${this.state.errorInfo?.componentStack}`;
    try {
      await navigator.clipboard.writeText(errorText);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("Failed to copy error details:", error.message);
      } else {
        console.error("Failed to copy error details:", error);
      }
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-4 flex min-h-100 flex-col items-center justify-center text-center">
          <div className="w-full max-w-lg rounded-xl border border-red-100 bg-white p-8 shadow-lg dark:border-red-900/50 dark:bg-neutral-900 dark:ring-1 dark:ring-white/[0.04]">
            {/* Icon */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 ring-4 ring-white dark:bg-red-950/30 dark:ring-neutral-900">
              <AlertTriangle className="h-8 w-8 text-red-500 dark:text-red-400" />
            </div>

            {/* Content */}
            <h2 className="mt-0 mb-2 text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
              {__("Something went wrong", "structura")}
            </h2>
            <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
              {__(
                "The architect encountered a critical error building this view. Don't worry, your content is safe in the database.",
                "structura"
              )}
            </p>

            {/* Error Details */}
            <div className="group relative mb-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-left dark:border-neutral-700 dark:bg-neutral-800">
              <button
                onClick={this.handleCopyError}
                className={cn(
                  "absolute top-2 right-2 cursor-pointer rounded-lg p-1.5 transition-all duration-150",
                  "text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]",
                  "dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                )}
                title={__("Copy Error Details", "structura")}
              >
                {this.state.copied ? (
                  <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>

              <code className="mb-2 block bg-transparent! pr-6! font-mono text-xs break-all text-red-600 dark:text-red-400">
                {this.state.error && this.state.error.toString()}
              </code>

              <details className="mt-4 cursor-pointer font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
                <summary className="select-none hover:text-neutral-600 dark:hover:text-neutral-300">
                  {__("View Stack Trace", "structura")}
                </summary>
                <div className="mt-2 max-h-32 overflow-x-auto border-l-2 border-neutral-300 pl-2 whitespace-pre-wrap dark:border-neutral-600">
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </div>
              </details>
            </div>

            {/* Actions */}
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button onClick={this.handleReload}>
                <RotateCcw className="mr-2 size-4" />
                {__("Reload Dashboard", "structura")}
              </Button>
              <Button
                href="https://structurawp.com/support/"
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
              >
                <LifeBuoy className="mr-2 size-4" />
                {__("Contact Support", "structura")}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
