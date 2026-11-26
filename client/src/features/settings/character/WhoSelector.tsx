/**
 * "Who appears in your images?" (recurring-character handoff §3): Nobody,
 * Person or Mascot as one radio group, with the reason row for a locked plan
 * or a site whose image setup cannot draw a character, and the kept line
 * when a saved character is not in use. The kept line carries Remove, which
 * is how consent is withdrawn without choosing Person again first.
 */
import type { ReactNode, Ref } from "react";
import { Link } from "react-router";
import { __, sprintf } from "@wordpress/i18n";
import {
  ArrowRight,
  ArrowUpRight,
  CircleDashed,
  Info,
  Lock,
  Smile,
  Trash2,
  UserRound,
} from "lucide-react";
import { Badge, Button, OptionCardGroup } from "@structura/ui";

import type { CharacterKind, VisualAppearance } from "../api/useVisualCharacter";

/** The grey reason row under the selector and the grid (handoff §3). */
export function ReasonRow({
  icon,
  children,
  role,
}: {
  icon: ReactNode;
  children: ReactNode;
  role?: "status";
}) {
  return (
    <div
      role={role}
      className="flex items-start gap-2 rounded-xl bg-neutral-100 px-3 py-2.5 text-[12.5px] leading-normal text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
    >
      <span aria-hidden="true" className="mt-0.5! shrink-0 text-neutral-500 dark:text-neutral-400">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">{children}</div>
    </div>
  );
}

/** Props for {@link WhoSelector}. */
export interface WhoSelectorProps {
  /** Id for the section heading. */
  headingId: string;
  value: VisualAppearance;
  onChange: (value: VisualAppearance) => void;
  /** The plan has no character (free and none). */
  locked: boolean;
  /**
   * The cloud refuses a character for this site (`characterAvailable`
   * false): since 2026-11-25, no Gemini or OpenAI key bound to it.
   */
  unavailable: boolean;
  /** The saved appearance: kept selectable after a downgrade or a change of image setup. */
  savedAppearance: VisualAppearance;
  /** The saved character while Nobody is chosen; the kept line names it. */
  kept: { name: string; kind: CharacterKind } | null;
  onRemoveKept: () => void;
  /** Pricing page link for the locked state. */
  upgradeHref: string;
  /** Wraps the radio group, for the focus move to Nobody after Remove. */
  groupRef: Ref<HTMLDivElement>;
}

/** The selector section at the top of the Visuals card. */
export function WhoSelector({
  headingId,
  value,
  onChange,
  locked,
  unavailable,
  savedAppearance,
  kept,
  onRemoveKept,
  upgradeHref,
  groupRef,
}: WhoSelectorProps) {
  const closed = locked || unavailable;
  const title = __("Who appears in your images?", "structura");
  // A saved choice stays selectable, like a signature kept after a downgrade.
  const disabled = (key: VisualAppearance) => key !== "nobody" && closed && key !== savedAppearance;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3
          id={headingId}
          className="m-0! text-base font-bold tracking-tight text-neutral-900! dark:text-white!"
        >
          {title}
        </h3>
        <p className="m-0! max-w-[62ch] text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {__(
            "Keep the same character in every image, like you or your brand’s mascot.",
            "structura"
          )}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <div ref={groupRef}>
          <OptionCardGroup
            ariaLabel={title}
            value={value}
            onChange={onChange}
            className="grid-cols-1 sm:grid-cols-3"
            options={[
              {
                value: "nobody",
                label: __("Nobody", "structura"),
                description: __(
                  "Each image picks its own subject. This is how images work today.",
                  "structura"
                ),
                icon: CircleDashed,
              },
              {
                value: "person",
                label: __("Person", "structura"),
                description: __(
                  "You or someone you work with, drawn from photos or drawings.",
                  "structura"
                ),
                icon: UserRound,
                disabled: disabled("person"),
              },
              {
                value: "mascot",
                label: __("Mascot", "structura"),
                description: __("Your brand’s mascot, drawn from its artwork.", "structura"),
                icon: Smile,
                disabled: disabled("mascot"),
              },
            ]}
          />
        </div>

        {locked ? (
          <ReasonRow icon={<Lock size={14} />}>
            <span>
              {__(
                "A recurring character is part of paid plans. Nobody stays selected until you upgrade.",
                "structura"
              )}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge intent="default" variant="outline" size="xs">
                <Lock size={10} aria-hidden="true" />
                {__("Paid plans", "structura")}
              </Badge>
              <a
                href={upgradeHref}
                target="_blank"
                rel="noreferrer"
                className="text-brand-600! dark:text-brand-400! inline-flex min-h-6 items-center gap-1 rounded-sm text-[13px] font-bold no-underline! hover:underline! max-sm:min-h-11"
              >
                {__("Upgrade plan", "structura")}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </span>
          </ReasonRow>
        ) : unavailable ? (
          <ReasonRow icon={<Info size={14} />}>
            <span>
              {__(
                "A character needs images drawn with Gemini or OpenAI. Under AI Engine, connect Gemini or OpenAI and turn on Default for image generation, then come back.",
                "structura"
              )}
            </span>
            <Link
              to="/ai-engine"
              className="text-brand-600! dark:text-brand-400! inline-flex min-h-6 items-center gap-1 text-[13px] font-bold no-underline! hover:underline! max-sm:min-h-11"
            >
              {__("Open AI Engine", "structura")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </ReasonRow>
        ) : null}

        {value === "nobody" && kept && (
          <ReasonRow icon={<Info size={14} />} role="status">
            <span>
              <b className="font-bold text-neutral-900 dark:text-white">
                {sprintf(
                  /* translators: %s: the character's name, e.g. "Lena" */
                  __("%s is saved but not used.", "structura"),
                  kept.name
                )}
              </b>{" "}
              {sprintf(
                kept.kind === "person"
                  ? /* translators: %s: the character's name, e.g. "Lena" */
                    __(
                      "New images won’t include this character. Choose Person again to bring %s back.",
                      "structura"
                    )
                  : /* translators: %s: the character's name, e.g. "Pip" */
                    __(
                      "New images won’t include this character. Choose Mascot again to bring %s back.",
                      "structura"
                    ),
                kept.name
              )}
            </span>
            <Button
              variant="transparent"
              size="sm"
              onClick={onRemoveKept}
              aria-label={sprintf(
                /* translators: %s: the character's name, e.g. "Lena" */
                __("Remove %s", "structura"),
                kept.name
              )}
              className="max-sm:min-h-11"
            >
              {/* The variant fixes the button's text colour; the span carries the danger tone. */}
              <span className="inline-flex items-center gap-1.5 text-red-700 dark:text-red-300">
                <Trash2 size={13} aria-hidden="true" />
                {__("Remove", "structura")}
              </span>
            </Button>
          </ReasonRow>
        )}
      </div>
    </section>
  );
}
