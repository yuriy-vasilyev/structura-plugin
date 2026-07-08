/**
 * The Video channel's original mark: a 9:16 rounded frame with a play
 * wedge, `currentColor` monochrome so it inherits the store-icon tile's
 * tint. Our own asset by design — the channel outputs for both YouTube
 * Shorts and TikTok, and using either platform's logo would create
 * brand-licensing exposure (design handoff, decision #5).
 *
 * Shared here so the wp-admin SPA and the portal render one identical
 * mark (store card, connection row, activity tile, empty states).
 */
export function VideoChannelGlyph({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      {...(className ? { className } : {})}
      aria-hidden="true"
    >
      <rect
        x="11.3"
        y="5.3"
        width="17.4"
        height="29.4"
        rx="4.7"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <path d="M17.6 15.2v9.6l8-4.8z" fill="currentColor" />
    </svg>
  );
}
