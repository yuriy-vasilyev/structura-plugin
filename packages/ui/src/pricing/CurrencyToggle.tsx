import { FC } from "react";
import { cn } from "../utils";

/** USD and EUR are priced at parity — the toggle is purely a display choice. */
export type Currency = "usd" | "eur";

export interface CurrencyToggleLabels {
  /** aria-label for the radiogroup container. */
  ariaLabel: string;
  /** Visible label inside the USD button (e.g. "USD" or "$"). */
  usd: string;
  /** Visible label inside the EUR button (e.g. "EUR" or "€"). */
  eur: string;
}

export interface CurrencyToggleProps {
  value: Currency;
  onChange: (next: Currency) => void;
  labels: CurrencyToggleLabels;
  className?: string;
}

export const CurrencyToggle: FC<CurrencyToggleProps> = ({
  value,
  onChange,
  labels,
  className,
}) => (
  <div
    role="radiogroup"
    aria-label={labels.ariaLabel}
    className={cn(
      "flex items-center gap-1 rounded-xl border border-neutral-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900 dark:ring-1 dark:ring-white/[0.04]",
      className
    )}
  >
    <button
      type="button"
      role="radio"
      aria-checked={value === "usd"}
      onClick={() => onChange("usd")}
      className={cn(
        "rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-fast",
        value === "usd"
          ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
          : "text-neutral-500"
      )}
    >
      {labels.usd}
    </button>
    <button
      type="button"
      role="radio"
      aria-checked={value === "eur"}
      onClick={() => onChange("eur")}
      className={cn(
        "rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-fast",
        value === "eur"
          ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
          : "text-neutral-500"
      )}
    >
      {labels.eur}
    </button>
  </div>
);

/**
 * Infer the visitor's preferred currency from `navigator.language`. Returns
 * "eur" when any of the user's preferred locales matches an EU/EEA region;
 * "usd" otherwise. Safe to call on the server — returns "usd" when
 * `navigator` is unavailable.
 *
 * Callers should check `readStoredCurrency()` first so a returning visitor
 * doesn't get their explicit choice overridden by browser language.
 */
export function inferDefaultCurrency(): Currency {
  if (typeof navigator === "undefined") return "usd";
  const langs = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  const EUR_HINTS =
    /^(de|fr|es|it|nl|pt|pl|fi|sv|da|el|ga|lt|lv|et|sk|sl|hr|hu|cs|bg|ro|mt)(-|$)/i;
  return langs.some((l) => EUR_HINTS.test(l)) ? "eur" : "usd";
}

const STORAGE_KEY = "structura.billing.currency";

/** Read the visitor's last currency choice from localStorage. SSR-safe. */
export function readStoredCurrency(): Currency | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "usd" || raw === "eur" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Persist the visitor's currency choice. Silent no-op on the server, in
 * private browsing, or when the storage quota is exceeded — the toggle still
 * works for the current session, we just don't remember it next time.
 */
export function writeStoredCurrency(next: Currency): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // intentionally swallow — see docblock
  }
}
