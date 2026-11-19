import { Fragment, type FC } from "react";

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/g;

/**
 * Drop sentence punctuation the URL pattern swallowed: "…/billing/." links
 * "…/billing/". A closing parenthesis stays when the URL opened one.
 */
function trimTrailingPunctuation(url: string): string {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (".,;:!?".includes(ch) || (ch === ")" && !url.slice(0, end - 1).includes("("))) {
      end -= 1;
      continue;
    }
    break;
  }
  return url.slice(0, end);
}

export interface LinkifiedTextProps {
  text: string;
  /** Screen-reader suffix on each link, e.g. "(opens in a new tab)". */
  newTabLabel?: string;
}

/**
 * Plain text with its http(s) URLs rendered as links that open in a new tab.
 * For messages shown verbatim, such as a provider's error on the API key
 * test (specs/provider-key-test.md). The text renders as React text, never
 * as HTML.
 */
export const LinkifiedText: FC<LinkifiedTextProps> = ({ text, newTabLabel }) => {
  const parts: Array<{ url: string } | string> = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimTrailingPunctuation(match[0]);
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push({ url });
    last = start + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <Fragment key={i}>{part}</Fragment>
        ) : (
          <a
            key={i}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            // Inline colour: wp-admin's unlayered `a { color }` beats layered
            // Tailwind colour utilities, and the link should read in the
            // colour of the message around it on both surfaces.
            style={{ color: "inherit" }}
            className="underline decoration-current/50 underline-offset-2 wrap-anywhere hover:decoration-current"
          >
            {part.url}
            {newTabLabel ? <span className="sr-only"> {newTabLabel}</span> : null}
          </a>
        )
      )}
    </>
  );
};
