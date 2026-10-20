import { useId } from "react";
import { Braces, CodeXml, Server, type LucideIcon } from "lucide-react";
import { cn } from "../utils";

/**
 * Site platforms the customer portal knows, keyed by id, with each display
 * name written the way its owner writes it. `custom`, `framework` and
 * `backend` are our own English descriptions, not brand names, so a
 * translated surface supplies its own words for them.
 *
 * Spec: specs/article-delivery-connect-flow.md §2, §5;
 * specs/portal-site-onboarding.md §3, §6.
 */
export const PLATFORMS = {
  lovable: "Lovable",
  bolt: "Bolt",
  v0: "v0",
  replit: "Replit",
  custom: "Custom",
  wordpress: "WordPress",
  nextjs: "Next.js",
  astro: "Astro",
  nuxt: "Nuxt",
  sveltekit: "SvelteKit",
  framework: "Another framework or app",
  backend: "My own backend",
} as const;

/** Id of a site platform in {@link PLATFORMS}. */
export type Platform = keyof typeof PLATFORMS;

/** Props for {@link PlatformMark}. */
export interface PlatformMarkProps {
  /** Which platform's mark to draw. */
  platform: Platform;
  /**
   * Rendered size in px: 16 (options, chips, site rows), 22 (wizard header,
   * result cards) or 32 (option-card tile). Defaults to 32.
   */
  size?: 16 | 22 | 32;
  /** Extra classes on the root element. */
  className?: string;
}

/** Our own options have no brand, so they draw a Lucide glyph instead. */
const GLYPHS = {
  custom: CodeXml,
  framework: Braces,
  backend: Server,
} as const satisfies Partial<Record<Platform, LucideIcon>>;

type GlyphPlatform = keyof typeof GLYPHS;

/** Returns whether `platform` draws a Lucide glyph rather than a brand mark. */
function isGlyphPlatform(platform: Platform): platform is GlyphPlatform {
  return platform in GLYPHS;
}

/**
 * The platforms' own marks as single filled paths (builders 2026-10-17,
 * replacing the letterform stand-ins; WordPress and the frameworks
 * 2026-10-19). v0, Replit, WordPress, Next.js, Astro, Nuxt and SvelteKit are
 * simple-icons paths (SvelteKit has no mark of its own and uses Svelte's);
 * Bolt is the bolt.new favicon's "b" cut out of its rounded tile (even-odd,
 * so the glyph shows the background); Lovable is the lovable.dev favicon
 * outline. Neither Lovable nor bolt.new publishes a brand kit, so the
 * favicons are the only first-party vectors. The simple-icons paths
 * rasterise identically under even-odd and nonzero (checked 2026-10-19), so
 * Bolt's rule serves every mark. Sources: handoffs/connect-platform-picker/logos
 * and handoffs/design_handoff_portal_site_onboarding/design/assets/marks.
 */
const MARKS: Record<Exclude<Platform, GlyphPlatform>, { viewBox: string; d: string }> = {
  lovable: {
    viewBox: "0 0 180 180",
    d: "M54.6052 0C83.9389 0 107.719 23.8424 107.719 53.2535V73.4931H125.395C154.729 73.4931 178.508 97.3355 178.508 126.747C178.508 156.158 154.729 180 125.395 180H1.4917V53.2535C1.4917 23.8424 25.2714 0 54.6052 0Z",
  },
  bolt: {
    viewBox: "0 0 16 16",
    d: "M4 0h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4ZM8.64368 11.7731C7.91976 11.7731 7.20901 11.5147 6.80099 10.9591L6.65707 11.6143L4 13L4.28684 11.6143L6.22186 3H8.59103L7.9066 6.03634C8.45941 5.44199 8.97273 5.22234 9.63083 5.22234C11.0523 5.22234 12 6.1397 12 7.81938C12 9.55074 10.9076 11.7731 8.64368 11.7731ZM9.55186 8.31036C9.55186 9.11144 8.97273 9.71871 8.22249 9.71871C7.8013 9.71871 7.4196 9.56366 7.16952 9.29233L7.53806 7.70309C7.81447 7.43176 8.13036 7.27671 8.49889 7.27671C9.06486 7.27671 9.55186 7.69017 9.55186 8.31036Z",
  },
  v0: {
    viewBox: "0 0 24 24",
    d: "M14.066 6.028v2.22h5.729q.075-.001.148.005l-5.853 5.752a2 2 0 0 1-.024-.309V8.247h-2.353v5.45c0 2.322 1.935 4.222 4.258 4.222h5.675v-2.22h-5.675q-.03 0-.059-.003l5.729-5.629q.006.082.006.166v5.465H24v-5.465a4.204 4.204 0 0 0-4.205-4.205zM0 8.245l8.28 9.266c.839.94 2.396.346 2.396-.914V8.245H8.19v5.44l-4.86-5.44Z",
  },
  replit: {
    viewBox: "0 0 24 24",
    d: "M2 1.5A1.5 1.5 0 0 1 3.5 0h7A1.5 1.5 0 0 1 12 1.5V8H3.5A1.5 1.5 0 0 1 2 6.5ZM12 8h8.5A1.5 1.5 0 0 1 22 9.5v5a1.5 1.5 0 0 1-1.5 1.5H12ZM2 17.5A1.5 1.5 0 0 1 3.5 16H12v6.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 2 22.5Z",
  },
  wordpress: {
    viewBox: "0 0 24 24",
    d: "M21.469 6.825c.84 1.537 1.318 3.3 1.318 5.175 0 3.979-2.156 7.456-5.363 9.325l3.295-9.527c.615-1.54.82-2.771.82-3.864 0-.405-.026-.78-.07-1.11m-7.981.105c.647-.03 1.232-.105 1.232-.105.582-.075.514-.93-.067-.899 0 0-1.755.135-2.88.135-1.064 0-2.85-.15-2.85-.15-.585-.03-.661.855-.075.885 0 0 .54.061 1.125.09l1.68 4.605-2.37 7.08L5.354 6.9c.649-.03 1.234-.1 1.234-.1.585-.075.516-.93-.065-.896 0 0-1.746.138-2.874.138-.2 0-.438-.008-.69-.015C4.911 3.15 8.235 1.215 12 1.215c2.809 0 5.365 1.072 7.286 2.833-.046-.003-.091-.009-.141-.009-1.06 0-1.812.923-1.812 1.914 0 .89.513 1.643 1.06 2.531.411.72.89 1.643.89 2.977 0 .915-.354 1.994-.821 3.479l-1.075 3.585-3.9-11.61.001.014zM12 22.784c-1.059 0-2.081-.153-3.048-.437l3.237-9.406 3.315 9.087c.024.053.05.101.078.149-1.12.393-2.325.609-3.582.609M1.211 12c0-1.564.336-3.05.935-4.39L7.29 21.709C3.694 19.96 1.212 16.271 1.211 12M12 0C5.385 0 0 5.385 0 12s5.385 12 12 12 12-5.385 12-12S18.615 0 12 0",
  },
  nextjs: {
    viewBox: "0 0 24 24",
    d: "M18.665 21.978C16.758 23.255 14.465 24 12 24 5.377 24 0 18.623 0 12S5.377 0 12 0s12 5.377 12 12c0 3.583-1.574 6.801-4.067 9.001L9.219 7.2H7.2v9.596h1.615V9.251l9.85 12.727Zm-3.332-8.533 1.6 2.061V7.2h-1.6v6.245Z",
  },
  astro: {
    viewBox: "0 0 24 24",
    d: "M8.358 20.162c-1.186-1.07-1.532-3.316-1.038-4.944.856 1.026 2.043 1.352 3.272 1.535 1.897.283 3.76.177 5.522-.678.202-.098.388-.229.608-.36.166.473.209.95.151 1.437-.14 1.185-.738 2.1-1.688 2.794-.38.277-.782.525-1.175.787-1.205.804-1.531 1.747-1.078 3.119l.044.148a3.158 3.158 0 0 1-1.407-1.188 3.31 3.31 0 0 1-.544-1.815c-.004-.32-.004-.642-.048-.958-.106-.769-.472-1.113-1.161-1.133-.707-.02-1.267.411-1.415 1.09-.012.053-.028.104-.045.165h.002zm-5.961-4.445s3.24-1.575 6.49-1.575l2.451-7.565c.092-.366.36-.614.662-.614.302 0 .57.248.662.614l2.45 7.565c3.85 0 6.491 1.575 6.491 1.575L16.088.727C15.93.285 15.663 0 15.303 0H8.697c-.36 0-.615.285-.784.727l-5.516 14.99z",
  },
  nuxt: {
    viewBox: "0 0 24 24",
    d: "M13.4642 19.8295h8.9218c.2834 0 .5618-.0723.8072-.2098a1.5899 1.5899 0 0 0 .5908-.5732 1.5293 1.5293 0 0 0 .216-.783 1.529 1.529 0 0 0-.2167-.7828L17.7916 7.4142a1.5904 1.5904 0 0 0-.5907-.573 1.6524 1.6524 0 0 0-.807-.2099c-.2833 0-.5616.0724-.807.2098a1.5904 1.5904 0 0 0-.5907.5731L13.4642 9.99l-2.9954-5.0366a1.5913 1.5913 0 0 0-.591-.573 1.6533 1.6533 0 0 0-.8071-.2098c-.2834 0-.5617.0723-.8072.2097a1.5913 1.5913 0 0 0-.591.573L.2168 17.4808A1.5292 1.5292 0 0 0 0 18.2635c-.0001.2749.0744.545.216.783a1.59 1.59 0 0 0 .5908.5732c.2454.1375.5238.2098.8072.2098h5.6003c2.219 0 3.8554-.9454 4.9813-2.7899l2.7337-4.5922L16.3935 9.99l4.3944 7.382h-5.8586ZM7.123 17.3694l-3.9083-.0009 5.8586-9.8421 2.9232 4.921-1.9572 3.2892c-.7478 1.1967-1.5972 1.6328-2.9163 1.6328z",
  },
  sveltekit: {
    viewBox: "0 0 24 24",
    d: "M10.354 21.125a4.44 4.44 0 0 1-4.765-1.767 4.109 4.109 0 0 1-.703-3.107 3.898 3.898 0 0 1 .134-.522l.105-.321.287.21a7.21 7.21 0 0 0 2.186 1.092l.208.063-.02.208a1.253 1.253 0 0 0 .226.83 1.337 1.337 0 0 0 1.435.533 1.231 1.231 0 0 0 .343-.15l5.59-3.562a1.164 1.164 0 0 0 .524-.778 1.242 1.242 0 0 0-.211-.937 1.338 1.338 0 0 0-1.435-.533 1.23 1.23 0 0 0-.343.15l-2.133 1.36a4.078 4.078 0 0 1-1.135.499 4.44 4.44 0 0 1-4.765-1.766 4.108 4.108 0 0 1-.702-3.108 3.855 3.855 0 0 1 1.742-2.582l5.589-3.563a4.072 4.072 0 0 1 1.135-.499 4.44 4.44 0 0 1 4.765 1.767 4.109 4.109 0 0 1 .703 3.107 3.943 3.943 0 0 1-.134.522l-.105.321-.286-.21a7.204 7.204 0 0 0-2.187-1.093l-.208-.063.02-.207a1.255 1.255 0 0 0-.226-.831 1.337 1.337 0 0 0-1.435-.532 1.231 1.231 0 0 0-.343.15L8.62 9.368a1.162 1.162 0 0 0-.524.778 1.24 1.24 0 0 0 .211.937 1.338 1.338 0 0 0 1.435.533 1.235 1.235 0 0 0 .344-.151l2.132-1.36a4.067 4.067 0 0 1 1.135-.498 4.44 4.44 0 0 1 4.765 1.766 4.108 4.108 0 0 1 .702 3.108 3.857 3.857 0 0 1-1.742 2.583l-5.589 3.562a4.072 4.072 0 0 1-1.135.499m10.358-17.95C18.484-.015 14.082-.96 10.9 1.068L5.31 4.63a6.412 6.412 0 0 0-2.896 4.295 6.753 6.753 0 0 0 .666 4.336 6.43 6.43 0 0 0-.96 2.396 6.833 6.833 0 0 0 1.168 5.167c2.229 3.19 6.63 4.135 9.812 2.108l5.59-3.562a6.41 6.41 0 0 0 2.896-4.295 6.756 6.756 0 0 0-.665-4.336 6.429 6.429 0 0 0 .958-2.396 6.831 6.831 0 0 0-1.167-5.168Z",
  },
};

/** Lovable's mark is its gradient; a flat heart reads as a generic icon (owner, 2026-10-17). */
const LOVABLE_GRADIENT = [
  { offset: "0", color: "#FF7A1A" },
  { offset: "0.5", color: "#FF4FA0" },
  { offset: "1", color: "#4B73FF" },
] as const;

/**
 * `<PlatformMark>` — a site platform's mark at 16, 22 or 32px. Every mark but
 * Lovable's draws in `currentColor`, so it follows the tile's tint in both
 * modes; Lovable keeps its brand gradient. Decorative: always pair it with
 * the platform's name in text (see `PlatformChip`), so it is hidden from
 * assistive tech.
 */
export function PlatformMark({ platform, size = 32, className }: PlatformMarkProps) {
  const gradientId = useId();
  if (isGlyphPlatform(platform)) {
    const Glyph = GLYPHS[platform];
    return (
      <Glyph
        size={size}
        aria-hidden="true"
        data-platform={platform}
        className={cn("shrink-0", className)}
      />
    );
  }

  const mark = MARKS[platform];
  const gradient = platform === "lovable";
  return (
    <svg
      width={size}
      height={size}
      viewBox={mark.viewBox}
      fill={gradient ? `url(#${gradientId})` : "currentColor"}
      fillRule="evenodd"
      aria-hidden="true"
      data-platform={platform}
      className={cn("shrink-0", className)}
    >
      {gradient && (
        <defs>
          <linearGradient id={gradientId} x1="0.7" y1="0" x2="0.3" y2="1">
            {LOVABLE_GRADIENT.map((stop) => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        </defs>
      )}
      <path d={mark.d} />
    </svg>
  );
}
