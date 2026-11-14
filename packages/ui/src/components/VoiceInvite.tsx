import type { Ref } from "react";
import { PenLine, Plus } from "lucide-react";
import { cn } from "../utils";
import { Button } from "./Button";

export interface VoiceInviteProps {
  title: string;
  body: string;
  /** The button's label, "Add your writing". */
  action: string;
  onAction: () => void;
  /** The button, for returning focus to it when the panel it opened is cancelled. */
  actionRef?: Ref<HTMLElement>;
  className?: string;
}

/**
 * VoiceInvite — the one dashed invitation in a persona with no writing read
 * yet (handoff persona voice, 2c, 2h and 4d). The whole nudge: nothing on
 * the persona card, no notices.
 */
export function VoiceInvite({ title, body, action, onAction, actionRef, className }: VoiceInviteProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[14px] border border-dashed border-neutral-300 px-4 py-3.5 dark:border-neutral-700",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
      >
        <PenLine size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0! text-[13.5px] font-bold text-neutral-900 dark:text-white">{title}</p>
        <p className="m-0! mt-0.5 text-pretty text-[12.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {body}
        </p>
        <Button
          ref={actionRef}
          type="button"
          variant="secondary"
          size="sm"
          onClick={onAction}
          className="mt-2.5"
        >
          <Plus aria-hidden="true" />
          {action}
        </Button>
      </div>
    </div>
  );
}
