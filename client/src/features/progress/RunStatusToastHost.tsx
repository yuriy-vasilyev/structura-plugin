import { useRunStatusToasts } from "./useRunStatusToasts";

/**
 * Invisible host that subscribes to active-run terminal-status
 * transitions and fires app-level toasts. Mounted once at the App root
 * (inside `<RunsProvider>`, so the hook can read `activeRunId`).
 *
 * Splitting the hook from its host lets unit tests reach the hook
 * directly via `renderHook(useRunStatusToasts)` without having to
 * render a passthrough component wrapper — the host exists purely so
 * App.tsx has something to mount.
 */
export const RunStatusToastHost = () => {
  useRunStatusToasts();
  return null;
};
