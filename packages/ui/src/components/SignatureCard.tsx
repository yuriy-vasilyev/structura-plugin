import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check, Lock, PenLine, Shapes, Type } from "lucide-react";
import { cn } from "../utils";
import { Badge } from "./Badge";
import { RecommendedLabel } from "./RecommendedLabel";
import { usePresetRadioCardGroupContext } from "./preset-radio-card-context";

// Spec: specs/visual-signatures.md §8. Layout and states follow the
// visual-signatures design handoff §3.2 (card), §6 (dark) and §10 (a11y).

/** Classes for a card frame, selected or at rest, plus the caller's. */
function frameClassName(selected: boolean, className?: string) {
  return cn(
    "flex h-full min-w-0 flex-col rounded-xl border p-2 transition-all duration-fast ease-out",
    // Ring and hover follow the card's own control, so a focused or hovered
    // footer link doesn't light up the whole card. /60 with an offset in the
    // card's colour: the /40 ring with no offset measured about 1.7:1 on white.
    "has-[[data-slot=signature-card-control]:focus-visible]:ring-2 has-[[data-slot=signature-card-control]:focus-visible]:ring-brand-500",
    "has-[[data-slot=signature-card-control]:focus-visible]:ring-offset-2 dark:has-[[data-slot=signature-card-control]:focus-visible]:ring-offset-neutral-900",
    selected
      ? "border-brand-600 bg-brand-50/60 shadow-glow-brand dark:border-brand-400 dark:bg-brand-500/10 dark:shadow-brand-400/22"
      : cn(
          "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900",
          "has-[[data-slot=signature-card-control]:enabled:hover]:border-neutral-300 dark:has-[[data-slot=signature-card-control]:enabled:hover]:border-neutral-600"
        ),
    className
  );
}

/**
 * The card's control (radio or button) covers thumbnail and body. It draws
 * no focus ring of its own: the frame does. `outline-hidden` keeps an
 * outline in forced-colors mode, where box-shadow rings don't paint.
 */
const CONTROL_CLASS =
  "flex w-full cursor-pointer flex-col items-stretch rounded-lg text-left focus:outline-hidden disabled:cursor-default";

/** Ids of the parts a card's control is named and described by. */
function usePartIds() {
  const id = useId();
  return {
    name: `${id}name`,
    description: `${id}description`,
    medium: `${id}medium`,
    inUse: `${id}in-use`,
    recommended: `${id}recommended`,
    reason: `${id}reason`,
    footer: `${id}footer`,
  };
}

type PartIds = ReturnType<typeof usePartIds>;

/** Space-joined ids, or `undefined` when none apply. */
const idList = (...ids: Array<string | false | undefined>) =>
  ids.filter(Boolean).join(" ") || undefined;

/** The 16:9 thumbnail slot: In use and lock chip top left, check badge top right. */
function Thumbnail({
  children,
  inUseLabel,
  inUseId,
  locked,
  selected,
}: {
  children: ReactNode;
  inUseLabel?: ReactNode;
  inUseId: string;
  locked: boolean;
  selected: boolean;
}) {
  return (
    <span
      data-slot="thumbnail"
      className="relative block aspect-video w-full overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800"
    >
      {children}
      {(inUseLabel != null || locked) && (
        <span className="absolute top-2 left-2 flex items-center gap-1.5">
          {inUseLabel != null && (
            <Badge id={inUseId} intent="secondary" size="xs">
              {inUseLabel}
            </Badge>
          )}
          {locked && (
            <span
              data-slot="lock-chip"
              aria-hidden="true"
              className="flex size-6 items-center justify-center rounded-full bg-white/95 text-neutral-700 shadow-sm dark:bg-neutral-900/90 dark:text-neutral-300"
            >
              <Lock size={13} strokeWidth={2.5} aria-hidden="true" />
            </span>
          )}
        </span>
      )}
      {/* State is aria-checked / aria-pressed; the badge is the visual mark. */}
      {selected && (
        <span
          data-slot="selected-check"
          aria-hidden="true"
          className="bg-brand-600 absolute top-2 right-2 flex size-[22px] items-center justify-center rounded-full text-white ring-2 ring-white"
        >
          <Check size={14} strokeWidth={3} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

/** Body under the thumbnail: recommendation, name, description, medium. */
function CardText({
  ids,
  name,
  description,
  mediumLabel,
  recommendedLabel,
}: {
  ids: PartIds;
  name: ReactNode;
  description?: ReactNode;
  mediumLabel?: ReactNode;
  recommendedLabel?: string;
}) {
  return (
    <span className="flex flex-col items-start gap-1.5 px-1 pt-2.5 pb-0.5">
      {recommendedLabel != null && (
        <span id={ids.recommended} className="flex">
          <RecommendedLabel label={recommendedLabel} />
        </span>
      )}
      <span
        id={ids.name}
        className="text-sm leading-tight font-bold tracking-tight text-neutral-900 dark:text-white"
      >
        {name}
      </span>
      {/* neutral-600, not 500: on the selected tint 500 drops to 4.48:1. */}
      {description != null && (
        <span
          id={ids.description}
          className="text-xs leading-[1.45] text-neutral-600 dark:text-neutral-400"
        >
          {description}
        </span>
      )}
      {mediumLabel != null && (
        <Badge id={ids.medium} intent="default" variant="outline" size="xs" className="mt-0.5">
          {mediumLabel}
        </Badge>
      )}
    </span>
  );
}

/** Reason strip and footer: inside the frame but outside the control, which they describe. */
function CardOutside({
  ids,
  reason,
  footer,
}: {
  ids: PartIds;
  reason?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      {reason != null && (
        <div
          id={ids.reason}
          className="border-rec-line bg-rec-soft text-rec-ink mt-2.5 rounded-lg border px-2.5 py-2 text-xs leading-[1.45]"
        >
          {reason}
        </div>
      )}
      {footer != null && (
        // mt-auto: the frame is h-full, so the footers of a grid row line up.
        <div data-slot="footer" className="mt-auto pt-2.5">
          <div
            id={ids.footer}
            className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t border-neutral-200 px-1 pt-2.5 dark:border-neutral-700"
          >
            {footer}
          </div>
        </div>
      )}
    </>
  );
}

/** Props for {@link SignatureCard}. */
export interface SignatureCardProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "name" | "children"
> {
  /** The value this card stands for in its `PresetRadioCardGroup`. */
  value: string;
  /** Signature name (14px bold). Part of the radio's accessible name. */
  name: ReactNode;
  /** One line under the name (12px `neutral-600`). Part of the radio's accessible name. */
  description?: ReactNode;
  /** Thumbnail image: the signature's test board. Decorative (`alt=""`). */
  thumbnailSrc?: string;
  /**
   * `srcset` for the thumbnail. Give the 640/1280 pair density descriptors
   * (`"…-640.webp 1x, …-1280.webp 2x"`): the card sets no `sizes`, so width
   * descriptors would be resolved against the whole viewport.
   */
  thumbnailSrcSet?: string;
  /** Render slot for the thumbnail area; wins over `thumbnailSrc`. */
  thumbnail?: ReactNode;
  /**
   * Medium tag under the description ("Illustration"), an outline badge.
   * Part of the radio's accessible name.
   */
  mediumLabel?: ReactNode;
  /** "In use" badge over the thumbnail, top left, on the bound signature. Describes the radio. */
  inUseLabel?: ReactNode;
  /**
   * Plan gate: a lock chip on the thumbnail and a disabled radio, which the
   * arrow keys skip. The frame does not dim. Pass `disabled={false}` to keep
   * the chip on a card that stays selectable: the kept-after-downgrade card.
   */
  locked?: boolean;
  /** Text of the `RecommendedLabel` that opens the body. Describes the radio. */
  recommendedLabel?: string;
  /** Why this card is recommended: a strip under the radio. Describes the radio. */
  reason?: ReactNode;
  /**
   * Row at the bottom of the card, under the radio behind a hairline: the
   * locked "Paid plans" badge and upgrade link, the kept-after-downgrade
   * note, or an Edit button. Children sit in a wrapping row, spaced apart;
   * a lone child that belongs on the right takes `ml-auto`. Describes the
   * radio, and its links and buttons stay in the Tab order.
   */
  footer?: ReactNode;
  /** Classes for the card frame (the grid item). The ref and every other prop go to the radio. */
  className?: string;
}

/**
 * SignatureCard: a library card in the visual-signature picker. A 16:9
 * thumbnail with its overlays, then name, description and medium, all inside
 * one `role="radio"` button; the recommendation reason and the footer sit
 * under it in the same frame.
 *
 * Must be rendered inside a `PresetRadioCardGroup` and shares its contract
 * with `PresetRadioCard`: `aria-checked`, roving tabindex, arrow keys and
 * Home/End that skip disabled radios.
 *
 * The radio is named by name, description and medium. The In use badge, the
 * recommendation, the reason and the footer describe it (`aria-describedby`),
 * so the name stays short and the footer's links stay separate controls.
 * When the current choice is not a radio (a free prompt, an unsaved draft),
 * give the group `value={undefined}` so every card stays tabbable.
 */
export const SignatureCard = forwardRef<HTMLButtonElement, SignatureCardProps>(
  (
    {
      value,
      name,
      description,
      thumbnailSrc,
      thumbnailSrcSet,
      thumbnail,
      mediumLabel,
      inUseLabel,
      locked = false,
      recommendedLabel,
      reason,
      footer,
      disabled,
      className,
      onClick,
      "aria-describedby": callerDescribedBy,
      ...props
    },
    ref
  ) => {
    const group = usePresetRadioCardGroupContext("SignatureCard");
    const ids = usePartIds();
    const checked = group.value === value;
    // Roving tabindex, as PresetRadioCard: with nothing checked every card
    // stays tabbable, so the group can't become keyboard-unreachable.
    const tabIndex = group.value == null ? 0 : checked ? 0 : -1;

    return (
      <div data-slot="signature-card" className={frameClassName(checked, className)}>
        <button
          ref={ref}
          type="button"
          role="radio"
          aria-checked={checked}
          aria-labelledby={idList(
            ids.name,
            description != null && ids.description,
            mediumLabel != null && ids.medium
          )}
          aria-describedby={idList(
            inUseLabel != null && ids.inUse,
            recommendedLabel != null && ids.recommended,
            reason != null && ids.reason,
            footer != null && ids.footer,
            callerDescribedBy
          )}
          tabIndex={tabIndex}
          disabled={disabled ?? locked}
          data-slot="signature-card-control"
          onClick={(event) => {
            onClick?.(event);
            if (!event.defaultPrevented) group.onValueChange(value);
          }}
          className={CONTROL_CLASS}
          {...props}
        >
          <Thumbnail inUseLabel={inUseLabel} inUseId={ids.inUse} locked={locked} selected={checked}>
            {thumbnail ??
              (thumbnailSrc ? (
                <img
                  src={thumbnailSrc}
                  srcSet={thumbnailSrcSet}
                  alt=""
                  loading="lazy"
                  className="block h-full w-full object-cover"
                />
              ) : null)}
          </Thumbnail>
          <CardText
            ids={ids}
            name={name}
            description={description}
            mediumLabel={mediumLabel}
            recommendedLabel={recommendedLabel}
          />
        </button>
        <CardOutside ids={ids} reason={reason} footer={footer} />
      </div>
    );
  }
);
SignatureCard.displayName = "SignatureCard";

/** Props for {@link SignatureActionCard}. */
export interface SignatureActionCardProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  /** Card name ("Your own", "Free prompt", a draft's name). Part of the button's accessible name. */
  label: ReactNode;
  /** One line under the label. Part of the button's accessible name. */
  description?: ReactNode;
  /** What fills the 16:9 thumbnail slot: `SignatureBuildTile` or `SignaturePromptTile`. */
  tile: ReactNode;
  /** Medium tag under the description ("Custom", "Text prompt"). Part of the accessible name. */
  mediumLabel?: ReactNode;
  /** "In use" badge over the tile, top left, e.g. on a bound free prompt. Describes the button. */
  inUseLabel?: ReactNode;
  /**
   * Whether this card is the current choice: draws the selected frame and
   * check badge and sets `aria-pressed`. Leave it out on a card that only
   * opens something; the button then has no pressed state at all.
   */
  selected?: boolean;
  /** Plan gate: a lock chip on the tile and a disabled button. */
  locked?: boolean;
  /** Row at the bottom, outside the button, as on {@link SignatureCard}. Describes the button. */
  footer?: ReactNode;
  /** Classes for the card frame (the grid item). The ref and every other prop go to the button. */
  className?: string;
}

/**
 * SignatureActionCard: the "Your own" and "Free prompt" cards of the
 * signature picker. Same frame, thumbnail slot and body as
 * {@link SignatureCard}, but a plain `<button type="button">`, so it can sit
 * in the picker's `PresetRadioCardGroup` without joining its arrow-key
 * cycle. When `selected`, give the group `value={undefined}` so every radio
 * stays tabbable.
 */
export const SignatureActionCard = forwardRef<HTMLButtonElement, SignatureActionCardProps>(
  (
    {
      label,
      description,
      tile,
      mediumLabel,
      inUseLabel,
      selected,
      locked = false,
      footer,
      disabled,
      className,
      "aria-describedby": callerDescribedBy,
      ...props
    },
    ref
  ) => {
    const ids = usePartIds();
    const isSelected = selected === true;

    return (
      <div data-slot="signature-card" className={frameClassName(isSelected, className)}>
        <button
          ref={ref}
          type="button"
          aria-pressed={selected}
          aria-labelledby={idList(
            ids.name,
            description != null && ids.description,
            mediumLabel != null && ids.medium
          )}
          aria-describedby={idList(
            inUseLabel != null && ids.inUse,
            footer != null && ids.footer,
            callerDescribedBy
          )}
          disabled={disabled ?? locked}
          data-slot="signature-card-control"
          className={CONTROL_CLASS}
          {...props}
        >
          <Thumbnail
            inUseLabel={inUseLabel}
            inUseId={ids.inUse}
            locked={locked}
            selected={isSelected}
          >
            {tile}
          </Thumbnail>
          <CardText ids={ids} name={label} description={description} mediumLabel={mediumLabel} />
        </button>
        <CardOutside ids={ids} footer={footer} />
      </div>
    );
  }
);
SignatureActionCard.displayName = "SignatureActionCard";

/** Props for {@link SignatureBuildTile}. */
export interface SignatureBuildTileProps {
  /** One-line caption under the icon ("Build from five fields"). */
  children: ReactNode;
  /**
   * The saved custom signature's tile: `Shapes` instead of `PenLine` and no
   * dashed outline, since the signature exists now.
   */
  saved?: boolean;
}

/**
 * Tile for the "Your own" card's thumbnail slot: a 36px brand square with
 * `PenLine` over a dashed slot, and a caption. Pass it as
 * `SignatureActionCard`'s `tile`, or `saved` as a `SignatureCard`'s
 * `thumbnail` once the custom signature exists.
 */
export function SignatureBuildTile({ children, saved = false }: SignatureBuildTileProps) {
  const Icon = saved ? Shapes : PenLine;
  return (
    <span
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg bg-neutral-50 dark:bg-neutral-900/50",
        !saved && "border-[1.5px] border-dashed border-neutral-300 dark:border-neutral-600"
      )}
    >
      <span className="bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400 flex size-9 items-center justify-center rounded-[10px]">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="px-3 text-center text-xs font-semibold text-neutral-700 dark:text-neutral-300">
        {children}
      </span>
    </span>
  );
}

/**
 * Tile for the "Free prompt" card's thumbnail slot: a `Type` icon over three
 * text bars at 100, 86 and 62 percent width. Decorative.
 */
export function SignaturePromptTile() {
  return (
    <span
      aria-hidden="true"
      className="flex h-full w-full flex-col justify-center gap-2 bg-neutral-50 px-[20%] dark:bg-neutral-900/50"
    >
      <Type
        size={18}
        aria-hidden="true"
        className="mb-0.5 shrink-0 text-neutral-500 dark:text-neutral-400"
      />
      <span
        data-slot="prompt-bar"
        className="block h-1.5 w-full rounded-full bg-neutral-300 dark:bg-neutral-600"
      />
      <span
        data-slot="prompt-bar"
        className="block h-1.5 w-[86%] rounded-full bg-neutral-300 dark:bg-neutral-600"
      />
      <span
        data-slot="prompt-bar"
        className="block h-1.5 w-[62%] rounded-full bg-neutral-300 dark:bg-neutral-600"
      />
    </span>
  );
}
