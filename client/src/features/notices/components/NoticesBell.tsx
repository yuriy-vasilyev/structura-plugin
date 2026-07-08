/**
 * Bell icon + popover for the wp-admin header.
 *
 * Replaces the previous "Notices" nav text link with the more
 * conventional notification-center pattern: an icon, a count badge
 * for open notices, and a popover with the top-N inline. "See all"
 * deep-links to the full /notices route for history (resolved
 * notices) and richer per-card layout.
 *
 * Data flow shares `useNoticesQuery` + the ack/dismiss mutations
 * with the page — the same 60s poll feeds both surfaces, and a
 * mutation here invalidates the query so the badge count updates
 * everywhere at once.
 */

import { useMemo } from "react";
import { __ } from "@wordpress/i18n";
import { NavLink } from "react-router";
import { Bell, CheckCircle, ExternalLink } from "lucide-react";
import { Badge, Button, Popover } from "@structura/ui";

import { useNoticesQuery } from "../api/useNoticesQuery";
import {
  useAcknowledgeNoticeMutation,
  useDismissNoticeMutation,
} from "../api/useNoticeMutations";
import type { Notice } from "../types";
import {
  SEVERITY_INTENT,
  categoryLabel,
  formatRelative,
  resolveCopy,
  resolveCta,
} from "../utils";

/** Soft cap on the popover list — anything more goes to "See all". */
const POPOVER_LIMIT = 5;

/**
 * Bell trigger with an absolutely-positioned count badge. Rendered
 * as `forwardRef`-able through `Popover.Trigger`'s `asChild` path so
 * HeadlessUI wires the open/close behavior onto the actual <button>.
 */
const BellTrigger: React.FC<{ openCount: number }> = ({ openCount }) => (
  <button
    type="button"
    className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
    aria-label={__("Notifications", "structura")}
  >
    <Bell className="h-5 w-5" aria-hidden />
    {openCount > 0 ? (
      <span
        className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
        aria-label={
          openCount === 1
            ? __("1 open notice", "structura")
            : // translators: %d is the number of open notices.
              `${openCount} ${__("open notices", "structura")}`
        }
      >
        {openCount > 9 ? "9+" : openCount}
      </span>
    ) : null}
  </button>
);

/**
 * One row inside the popover. Compact — the page renders a fuller
 * card; here we keep it tight so 5 fit on screen without scrolling.
 */
const PopoverNoticeRow: React.FC<{
  notice: Notice;
  isPending: boolean;
  onAcknowledge: () => void;
  onDismiss: () => void;
}> = ({ notice, isPending, onAcknowledge, onDismiss }) => {
  const cta = resolveCta(notice.cta);
  return (
    <li className="border-b border-neutral-200 px-3 py-3 last:border-b-0 dark:border-neutral-800">
      <div className="mb-1 flex items-center gap-2">
        <Badge intent={SEVERITY_INTENT[notice.severity]}>
          {categoryLabel(notice.category)}
        </Badge>
        {notice.status === "acknowledged" ? (
          <Badge intent="default">{__("Acknowledged", "structura")}</Badge>
        ) : null}
        <span className="ml-auto text-[11px] text-neutral-500">
          {formatRelative(notice.lastSeenAt)}
        </span>
      </div>
      <h4 className="m-0! text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {resolveCopy(notice.titleKey, notice.bodyParams)}
      </h4>
      <p className="mt-1! mb-0! text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        {resolveCopy(notice.bodyKey, notice.bodyParams)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {cta ? (
          <a
            href={cta.href}
            target={cta.external ? "_blank" : undefined}
            rel={cta.external ? "noreferrer noopener" : undefined}
            // `text-white!`: the CTA is an <a>, and WP admin's global
            // `a { color }` rule otherwise overrides the white text and
            // renders it near-invisible on the brand fill.
            className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white! transition hover:bg-brand-500"
          >
            {resolveCopy(notice.cta!.labelKey)}
            {cta.external ? <ExternalLink className="h-3 w-3" aria-hidden /> : null}
          </a>
        ) : null}
        {notice.status === "open" ? (
          <Button
            variant="transparent"
            size="sm"
            disabled={isPending}
            onClick={onAcknowledge}
          >
            {__("Acknowledge", "structura")}
          </Button>
        ) : null}
        <Button
          variant="transparent"
          size="sm"
          disabled={isPending}
          onClick={onDismiss}
        >
          {__("Dismiss", "structura")}
        </Button>
      </div>
    </li>
  );
};

export const NoticesBell: React.FC = () => {
  const { data } = useNoticesQuery();
  const acknowledge = useAcknowledgeNoticeMutation();
  const dismiss = useDismissNoticeMutation();

  // Open notices drive the badge count; acknowledged ones still
  // appear in the popover but don't bump the unread chip — that
  // matches the two-state machine in spec/v2/notification-center.md §6.
  const openCount = useMemo(
    () => (data?.notices ?? []).filter((n) => n.status === "open").length,
    [data],
  );

  // Sort: open first, then acknowledged; both by lastSeenAt desc.
  // Bound to POPOVER_LIMIT so the panel stays scannable.
  const top = useMemo(() => {
    const all = [...(data?.notices ?? [])].sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      return b.lastSeenAt - a.lastSeenAt;
    });
    return all.slice(0, POPOVER_LIMIT);
  }, [data]);

  return (
    <Popover>
      <Popover.Trigger asChild>
        <span className="inline-flex">
          <BellTrigger openCount={openCount} />
        </span>
      </Popover.Trigger>
      <Popover.Content
        anchor={{ to: "bottom end", gap: 8 }}
        className="w-[360px] max-w-[calc(100vw-2rem)]"
      >
        <div className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <p className="m-0! text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {__("Notifications", "structura")}
          </p>
        </div>

        {top.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <CheckCircle
              className="mx-auto h-6 w-6 text-emerald-500"
              aria-hidden
            />
            <p className="mt-2! mb-0! text-xs text-neutral-500 dark:text-neutral-400">
              {__("No active notices.", "structura")}
            </p>
          </div>
        ) : (
          <ul className="m-0 max-h-[60vh] list-none overflow-y-auto p-0">
            {top.map((notice) => {
              const isPending =
                (acknowledge.isPending &&
                  acknowledge.variables?.noticeId === notice.noticeId) ||
                (dismiss.isPending &&
                  dismiss.variables?.noticeId === notice.noticeId);
              return (
                <PopoverNoticeRow
                  key={notice.noticeId}
                  notice={notice}
                  isPending={isPending}
                  onAcknowledge={() =>
                    acknowledge.mutate({ noticeId: notice.noticeId })
                  }
                  onDismiss={() => dismiss.mutate({ noticeId: notice.noticeId })}
                />
              );
            })}
          </ul>
        )}

        <div className="border-t border-neutral-200 px-3 py-2 text-right dark:border-neutral-800">
          <NavLink
            to="/notices"
            className="text-xs font-medium text-brand-600 hover:text-brand-500 dark:text-brand-400"
          >
            {__("See all", "structura")}
          </NavLink>
        </div>
      </Popover.Content>
    </Popover>
  );
};
