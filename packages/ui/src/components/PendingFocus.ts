import { useCallback, useEffect, useRef } from "react";

/**
 * Moves focus to an element that may not be on the page yet (handoff persona
 * voice, "Announcements and focus"). `focusWhenReady(key)` records a request;
 * after every commit of the calling component, `resolve(key)` is asked for the
 * element and the request stays until that element is mounted and takes
 * focus. Spending the request on the next commit lost focus to the page when
 * the real backend mounted a redraft's Undo a render later (2026-11-14).
 *
 * A newer request replaces an older one. A click or a key press anywhere
 * drops the request, so a late target never pulls focus back from where the
 * customer moved it; focus moved by code, such as a dialog's focus trap,
 * does not.
 *
 * @returns `focusWhenReady(key)`.
 */
export function usePendingFocus<K>(
  resolve: (key: K) => HTMLElement | null | undefined,
): (key: K) => void {
  const pending = useRef<{ key: K } | null>(null);
  const stopListening = useRef<(() => void) | null>(null);

  const clear = useCallback(() => {
    pending.current = null;
    stopListening.current?.();
    stopListening.current = null;
  }, []);

  useEffect(() => {
    const request = pending.current;
    if (!request) return;
    const element = resolve(request.key);
    if (!element?.isConnected) return;
    element.focus();
    if (document.activeElement === element) clear();
  });

  useEffect(() => clear, [clear]);

  return useCallback(
    (key: K) => {
      clear();
      pending.current = { key };
      document.addEventListener("pointerdown", clear, true);
      document.addEventListener("keydown", clear, true);
      stopListening.current = () => {
        document.removeEventListener("pointerdown", clear, true);
        document.removeEventListener("keydown", clear, true);
      };
    },
    [clear],
  );
}
