/**
 * ARCHITECT SHIM: satisfy React 17+ automatic JSX runtimes & version checks
 */
import AppErrorBoundary from "@/components/Layout/AppErrorBoundary";
import "./style.css";
import { createRoot, StrictMode } from "@wordpress/element";
import App from "./App";
import { CloudConsentGate, needsCloudConsent } from "@/components/Shared/CloudConsentGate";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast, ToastProvider } from "@structura/ui";
import { __ } from "@wordpress/i18n";

import { installWpJsxRuntimeShim } from "@/lib/wpJsxRuntimeShim";

if (window.wp?.element) {
  const element = window.wp.element as any;

  // 1. Shim the React 17+ automatic JSX runtime when WP's `wp.element` doesn't
  //    provide it. See `wpJsxRuntimeShim` for the full rationale — the naive
  //    `jsx = createElement` alias clobbered `children` with `key` and crashed
  //    keyed @structura/ui renders (React #130, onboarding competitors step).
  installWpJsxRuntimeShim(element);

  // 2. Shim Version (Fixes the .split() error)
  // We grab it from window.React (which WP provides) or hardcode it to 18
  if (!element.version) {
    element.version = window.React?.version || "18.3.1";
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // Global catch-all. A query can opt OUT of the toast by setting
    // `meta: { silentError: true }` — used by hooks that have their own
    // in-page advisory for known recoverable failures (e.g. the Channels
    // queries render a "this host isn't a registered activation" inline
    // banner instead of the generic "Data Fetch Error" toast). The
    // opt-out is explicit per query rather than global so anything that
    // forgets to set it still surfaces to the user by default.
    onError: (error, query) => {
      if (query.meta?.silentError) return;
      toast.error(`${__("Data Fetch Error:", "structura")} ${error.message}`);
    },
  }),
  mutationCache: new MutationCache({
    // Mirrors the QueryCache opt-out above. Mutations that surface their
    // own structured error UI (e.g. the campaign-limit-reached toast in
    // useCampaignMutations.ts, which carries a Contact Us CTA the
    // generic "Action Failed: …" toast can't render) set
    // `meta: { silentError: true }` so the global handler stays out of
    // the way. Default-on for everything else so a forgotten onError
    // still surfaces to the user.
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.meta?.silentError) return;
      toast.error(`${__("Action Failed:", "structura")} ${error.message}`);
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

document.addEventListener("DOMContentLoaded", () => {
  const rootElement = document.getElementById("structura-root");
  if (rootElement) {
    createRoot(rootElement).render(
      <StrictMode>
        <AppErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              {/* wp.org guidelines 7 & 9 — until the admin has opted in
                  to Structura Cloud, mount ONLY the consent screen. Not
                  a route inside <App/>: the app's banners and license
                  hooks fire cloud-backed queries on mount, and none of
                  them may run before the decision. PHP refuses those
                  requests anyway (Cloud_Client::post guard); this keeps
                  the SPA from showing a wall of "cloud unreachable". */}
              {needsCloudConsent(window.structuraConfig) ? <CloudConsentGate /> : <App />}
            </ToastProvider>
          </QueryClientProvider>
        </AppErrorBoundary>
      </StrictMode>
    );
  }
});
