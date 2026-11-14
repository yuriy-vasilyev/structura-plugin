import { useCallback, useState, type ReactNode } from "react";

/**
 * A polite screen-reader announcer: render `region` once, where it stays
 * mounted, and call `announce(text)` for each event. A live region only
 * speaks when its text changes, so a repeated message alternates a
 * trailing no-break space to be read again.
 */
export function useLiveAnnouncer(): { announce: (text: string) => void; region: ReactNode } {
  const [message, setMessage] = useState("");
  const announce = useCallback((text: string) => {
    setMessage((previous) => (previous === text ? `${text} ` : text));
  }, []);
  const region = (
    <span role="status" aria-live="polite" className="sr-only">
      {message}
    </span>
  );
  return { announce, region };
}
