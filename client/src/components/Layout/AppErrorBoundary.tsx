import type { ComponentType, FC, ReactNode } from "react";
import type { FallbackProps } from "react-error-boundary";
import { ErrorBoundary } from "react-error-boundary";
import { useLocation } from "react-router";
import { __ } from "@wordpress/i18n";
import { Button, Card } from "@structura/ui";
import { AlertTriangle, ArrowRight } from "lucide-react";

// react-error-boundary's `resetKeys` prop type isn't re-exported, so we
// re-derive a minimal compatible shape here.
type ResetKey = string | number | boolean | null | undefined;

const FallbackComponent: ComponentType<FallbackProps> = ({ error, resetErrorBoundary }) => {
  console.error(error);

  // A stale local license pointing at a removed/disconnected cloud
  // activation makes every bearer-authed call fail (401/403), which can
  // surface as a render crash. Detect that shape and offer a recovery path
  // to Account settings (reconnect / remove this site) rather than a
  // dead-end "Try again" that just re-crashes on the same dead connection.
  const message = error instanceof Error ? error.message : "";
  const looksLikeConnection =
    /unauthor|forbidden|\b401\b|\b403\b|license|activation|workspace/i.test(message);

  return (
    <main
      data-testid="app-error-boundary"
      className="grid min-h-[60vh] place-items-center px-4 py-12"
    >
      <Card className="w-full max-w-md p-8! text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/30">
          <AlertTriangle className="h-7 w-7 text-red-500 dark:text-red-400" />
        </div>

        <h1 className="mt-5! mb-0! text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          {looksLikeConnection
            ? __("This site's connection needs attention", "structura")
            : __("Unexpected error occurred", "structura")}
        </h1>
        <p className="mt-2! mb-0! text-sm leading-relaxed break-words text-neutral-500 dark:text-neutral-400">
          {looksLikeConnection
            ? __(
                "Structura Cloud couldn't authenticate this site — its connection may have been removed or reset. Open Account settings to reconnect, or disconnect and start fresh.",
                "structura",
              )
            : error instanceof Error
              ? error.message
              : __("Something went wrong, sorry.", "structura")}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {looksLikeConnection && (
            <Button href="#/account">{__("Account settings", "structura")}</Button>
          )}
          <Button
            onClick={resetErrorBoundary}
            variant={looksLikeConnection ? "secondary" : "primary"}
          >
            {__("Try again", "structura")}
          </Button>
          <Button href="https://www.structurawp.com/support/" target="_blank" variant="transparent">
            {__("Contact support", "structura")}
            <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </Card>
    </main>
  );
};

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
  /**
   * When true, the boundary calls `useLocation()` and resets itself on
   * every pathname change. Required for usages mounted *inside* a router
   * (e.g. `App.tsx`) so a per-page render-loop doesn't jam the fallback
   * for the rest of the session. MUST stay false for the outer
   * safety-net usage in `index.tsx`, which sits above `<HashRouter>` —
   * `useLocation` throws outside a Router context.
   */
  readonly resetOnNavigation?: boolean;
}

const AppErrorBoundary: FC<AppErrorBoundaryProps> = ({ children, resetOnNavigation = false }) => {
  return resetOnNavigation ? (
    <RouteAwareBoundary>{children}</RouteAwareBoundary>
  ) : (
    <ErrorBoundary FallbackComponent={FallbackComponent}>{children}</ErrorBoundary>
  );
};

/**
 * Inner variant that resets the boundary on every pathname change.
 * Split out so the `useLocation()` call only runs when the consumer
 * opted in — the hook throws when used outside a Router context, which
 * is exactly the shape of the outer safety-net usage in `index.tsx`.
 */
const RouteAwareBoundary: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const location = useLocation();
  const resetKeys: ResetKey[] = [location.pathname];
  return (
    <ErrorBoundary FallbackComponent={FallbackComponent} resetKeys={resetKeys}>
      {children}
    </ErrorBoundary>
  );
};

export default AppErrorBoundary;
