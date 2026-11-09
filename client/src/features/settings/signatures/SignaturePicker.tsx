/**
 * The signature picker (visual-signatures handoff §2.1, §2.5, §3.2, §3.3):
 * a radiogroup of library cards, plus "Your own" and "Free prompt" on the
 * Visuals page. Spec: specs/visual-signatures.md §8.
 */
import { __ } from "@wordpress/i18n";
import { ArrowUpRight, Info, Lock, Pencil } from "lucide-react";
import type { Ref } from "react";
import {
  Badge,
  Button,
  PresetRadioCardGroup,
  SignatureActionCard,
  SignatureBuildTile,
  SignatureCard,
  SignaturePromptTile,
} from "@structura/ui";
import { isSignatureId, type SignatureId, type SignatureMeta } from "@structura/visual-signatures";

import {
  mediumLabel,
  OWN_SAVED_DESCRIPTION,
  signatureDescription,
  signatureName,
} from "./signatureCopy";
import {
  CUSTOM_CARD_VALUE,
  isBuilderLocked,
  isLibraryCardLocked,
  selectionForCard,
  type CustomSignatureDraft,
  type SignatureSelection,
} from "./signatureModel";

/** The page's extra cards: "Your own" (button, or radio once a custom signature exists) and "Free prompt". */
export interface SignaturePickerExtras {
  /** The custom signature draft; null until one exists, when "Your own" is a button. */
  custom: CustomSignatureDraft | null;
  /** Opens the builder (from the "Your own" button or the saved card's Edit). */
  onOpenBuilder: () => void;
  /** Checks "Free prompt". */
  onSelectFree: () => void;
}

/** Props for {@link SignaturePicker}. */
export interface SignaturePickerProps {
  /** Id of the heading that names the radiogroup. */
  labelledBy: string;
  /** Library cards in display order. */
  signatures: readonly SignatureMeta[];
  /** The checked choice. */
  selection: SignatureSelection;
  /** The preset's saved choice: its card shows "In use". Omitted in the wizard. */
  bound?: SignatureSelection | null;
  /** License plan; free and none lock the library and "Your own". */
  plan: string | undefined;
  /** The thin pass's pick: its card shows "Our pick for your brand". */
  pickId?: SignatureId | null;
  /** Why the pick suits the brand, as a strip under its card. */
  reason?: string;
  /** Pricing page link for the locked cards' "Upgrade plan". */
  upgradeHref: string;
  /** Called with the selection a card click or arrow key makes. */
  onSelect: (selection: SignatureSelection) => void;
  /** "Your own" and "Free prompt"; the wizard has neither. */
  extras?: SignaturePickerExtras;
  /** The custom card's radio, so "All signatures" can return focus to it. */
  customCardRef?: Ref<HTMLButtonElement>;
}

/** The locked card footer: "Paid plans" and the upgrade link. */
function UpgradeFooter({ href }: { href: string }) {
  return (
    <>
      <Badge intent="default" variant="outline" size="xs">
        <Lock size={10} aria-hidden="true" />
        {__("Paid plans", "structura")}
      </Badge>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-brand-600! dark:text-brand-400! inline-flex min-h-6 items-center gap-1 rounded-sm text-[13px] font-bold no-underline! hover:underline! max-sm:min-h-11"
      >
        {__("Upgrade plan", "structura")}
        <ArrowUpRight size={14} aria-hidden="true" />
      </a>
    </>
  );
}

/** The kept-after-downgrade footer (spec §7): the card stays selectable, with a warning. */
function KeptFooter() {
  return (
    <span className="flex items-start gap-1.5 text-xs leading-[1.45] text-neutral-500 dark:text-neutral-400">
      <Info size={13} className="mt-px shrink-0" aria-hidden="true" />
      {__(
        "Kept from your previous plan. If you switch to another style, you can’t pick this one again without upgrading.",
        "structura"
      )}
    </span>
  );
}

/**
 * SignaturePicker: library cards in the given order, each marked selected,
 * in use, recommended or locked (handoff §2.1). A locked card that is in use
 * is "kept": selectable, with no upgrade link. Arrow keys move among the
 * enabled radios; "Your own" and "Free prompt" are plain buttons in the grid
 * until a custom signature exists.
 */
export function SignaturePicker({
  labelledBy,
  signatures,
  selection,
  bound,
  plan,
  pickId,
  reason,
  upgradeHref,
  onSelect,
  extras,
  customCardRef,
}: SignaturePickerProps) {
  const custom = extras?.custom ?? null;
  // The group's value names a radio; with "Free prompt" checked (a button)
  // it is undefined, which keeps every card tabbable.
  const groupValue =
    selection.kind === "curated"
      ? selection.id
      : selection.kind === "custom" && custom
        ? CUSTOM_CARD_VALUE
        : undefined;

  const handleValueChange = (value: string) => {
    if (value === CUSTOM_CARD_VALUE) {
      onSelect({ kind: "custom" });
    } else if (isSignatureId(value)) {
      onSelect(selectionForCard(value, bound));
    }
  };

  const builderLocked = isBuilderLocked(plan);
  const customInUse = bound?.kind === "custom";
  const customKept = builderLocked && customInUse;

  return (
    <PresetRadioCardGroup
      aria-labelledby={labelledBy}
      value={groupValue}
      onValueChange={handleValueChange}
      className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-3"
    >
      {signatures.map((meta) => {
        const locked = isLibraryCardLocked(meta, plan);
        const inUse = bound?.kind === "curated" && bound.id === meta.id;
        const kept = locked && inUse;
        const recommended = pickId === meta.id;
        return (
          <SignatureCard
            key={meta.id}
            value={meta.id}
            name={signatureName(meta.id)}
            description={signatureDescription(meta.id)}
            thumbnailSrc={meta.thumbnail.small}
            thumbnailSrcSet={`${meta.thumbnail.small} 1x, ${meta.thumbnail.large} 2x`}
            mediumLabel={mediumLabel(meta.medium)}
            inUseLabel={inUse ? __("In use", "structura") : undefined}
            locked={locked}
            disabled={kept ? false : undefined}
            recommendedLabel={recommended ? __("Our pick for your brand", "structura") : undefined}
            reason={recommended && reason ? reason : undefined}
            footer={
              kept ? <KeptFooter /> : locked ? <UpgradeFooter href={upgradeHref} /> : undefined
            }
          />
        );
      })}

      {extras &&
        (custom ? (
          <SignatureCard
            ref={customCardRef}
            value={CUSTOM_CARD_VALUE}
            name={custom.name.trim() || __("Your own", "structura")}
            description={OWN_SAVED_DESCRIPTION[custom.medium]}
            thumbnail={
              <SignatureBuildTile saved>
                {__("Preview it below to see it", "structura")}
              </SignatureBuildTile>
            }
            mediumLabel={__("Custom", "structura")}
            inUseLabel={customInUse ? __("In use", "structura") : undefined}
            locked={builderLocked}
            disabled={customKept ? false : undefined}
            footer={
              customKept ? (
                <KeptFooter />
              ) : builderLocked ? (
                <UpgradeFooter href={upgradeHref} />
              ) : (
                <Button
                  variant="transparent"
                  size="sm"
                  className="ml-auto max-sm:min-h-11"
                  onClick={extras.onOpenBuilder}
                >
                  <Pencil aria-hidden="true" />
                  {__("Edit", "structura")}
                </Button>
              )
            }
          />
        ) : (
          <SignatureActionCard
            label={__("Your own", "structura")}
            description={__("Set the technique, motifs and framing yourself.", "structura")}
            tile={
              <SignatureBuildTile>{__("Build from five fields", "structura")}</SignatureBuildTile>
            }
            mediumLabel={__("Custom", "structura")}
            locked={builderLocked}
            onClick={extras.onOpenBuilder}
            footer={builderLocked ? <UpgradeFooter href={upgradeHref} /> : undefined}
          />
        ))}

      {extras && (
        <SignatureActionCard
          label={__("Free prompt", "structura")}
          description={__("Describe the look in your own words.", "structura")}
          tile={<SignaturePromptTile />}
          mediumLabel={__("Text prompt", "structura")}
          inUseLabel={bound?.kind === "free" ? __("In use", "structura") : undefined}
          selected={selection.kind === "free"}
          onClick={extras.onSelectFree}
        />
      )}
    </PresetRadioCardGroup>
  );
}
