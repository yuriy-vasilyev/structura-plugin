import { FC, ReactNode } from "react";
import { Check } from "lucide-react";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

/**
 * One action on a {@link PromptDialog}. `onClick` for SPA-side effects
 * (navigation via the caller's router, mutations); `href` for plain
 * links (external pages). When both are omitted on the secondary
 * action, it simply closes the dialog.
 */
export interface PromptDialogAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface PromptDialogProps {
  open: boolean;
  onClose: () => void;
  /** Optional leading icon rendered beside the title. */
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  /**
   * Optional check-list rendered between description and the CTAs —
   * the upsell variant's "here's what you'd unlock" highlights.
   */
  bullets?: string[];
  /**
   * Primary CTA (brand button). Omit for a plain informational dialog —
   * the secondary (or an implicit "close") is then the only action.
   */
  primaryAction?: PromptDialogAction;
  /** Secondary CTA (quiet button). Defaults its click to `onClose`. */
  secondaryAction?: PromptDialogAction;
}

/**
 * App-wide explainer/upsell dialog — title, description, and up to two
 * CTAs. Born from the tier-gating work (2026-09-03): a gated action
 * should OPEN an explanation with a way forward ("Upgrade" / "Maybe
 * later"), not sit disabled and mute. Reuse it for any "why can't I do
 * this?" moment instead of hand-rolling one-off dialogs.
 */
export const PromptDialog: FC<PromptDialogProps> = ({
  open,
  onClose,
  icon,
  title,
  description,
  bullets,
  primaryAction,
  secondaryAction,
}) => (
  <Dialog.Root open={open} onClose={onClose} size="md">
    <Dialog.Content>
      <Dialog.Header>
        {icon ? (
          <div className="flex items-center gap-2">
            {icon}
            <Dialog.Title>{title}</Dialog.Title>
          </div>
        ) : (
          <Dialog.Title>{title}</Dialog.Title>
        )}
        <Dialog.Description>{description}</Dialog.Description>
      </Dialog.Header>
      {bullets && bullets.length > 0 && (
        <Dialog.Body>
          <ul className="space-y-2.5">
            {bullets.map((bullet) => (
              <li
                key={bullet}
                className="flex items-start gap-2.5 text-sm leading-snug text-gray-700 dark:text-gray-300"
              >
                <Check
                  size={15}
                  className="mt-0.5 shrink-0 stroke-[3px] text-emerald-500"
                  aria-hidden
                />
                {bullet}
              </li>
            ))}
          </ul>
        </Dialog.Body>
      )}
      <Dialog.Footer>
        {secondaryAction && (
          <Button
            variant="secondary"
            onClick={secondaryAction.onClick ?? onClose}
            {...(secondaryAction.href ? { href: secondaryAction.href } : {})}
          >
            {secondaryAction.label}
          </Button>
        )}
        {primaryAction &&
          (primaryAction.href ? (
            <Button href={primaryAction.href}>{primaryAction.label}</Button>
          ) : (
            <Button onClick={primaryAction.onClick}>{primaryAction.label}</Button>
          ))}
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
);
