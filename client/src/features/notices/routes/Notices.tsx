/**
 * wp-admin Notices page (Structura → Notices).
 *
 * Spec: `specs/v2/notification-center.md` §5.2.
 *
 * Polls `/structura/v1/notices` every 60s; ack and dismiss use the
 * matching `/notices/{acknowledge,dismiss}` REST proxies that
 * forward to the cloud's bearer-authed HTTP endpoints. The cloud
 * carries the per-notice ownership check; we just render and
 * forward intent.
 *
 * Reached via "See all" from the header's <NoticesBell /> popover
 * (the day-to-day entry point) and direct deep-links from emails /
 * support conversations. The page renders fuller cards than the
 * popover; copy resolution + CTA rendering are shared via
 * `../utils.ts` so both surfaces stay in lockstep.
 */

import { useMemo } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { Badge, Button, Card, PageLoader } from "@structura/ui";
import { CheckCircle, ExternalLink } from "lucide-react";

import { PageTitle } from "@/components/Layout/PageTitle";
import { PageDescription } from "@/components/Layout/PageSubtitle";

import { useNoticesQuery } from "../api/useNoticesQuery";
import {
  useAcknowledgeNoticeMutation,
  useDismissNoticeMutation,
} from "../api/useNoticeMutations";
import {
  SEVERITY_INTENT,
  categoryLabel,
  formatRelative,
  resolveCopy,
  resolveCta,
} from "../utils";

export const Notices = () => {
  const { data, isLoading, isFetching } = useNoticesQuery();
  const acknowledge = useAcknowledgeNoticeMutation();
  const dismiss = useDismissNoticeMutation();

  const sorted = useMemo(() => {
    if (!data?.notices) return [];
    return [...data.notices].sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      return b.lastSeenAt - a.lastSeenAt;
    });
  }, [data]);

  return (
    <div>
      <PageTitle>{__("Notices", "structura")}</PageTitle>
      <PageDescription>
        {__(
          "Account, billing, and connection issues that need your attention.",
          "structura",
        )}
      </PageDescription>

      {isLoading ? (
        <PageLoader />
      ) : sorted.length === 0 ? (
        <Card className="mt-6 p-6 text-center">
          <CheckCircle className="mx-auto h-8 w-8 text-emerald-500" aria-hidden />
          <p className="mt-3 text-base font-semibold">
            {__("All clear.", "structura")}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {isFetching
              ? __("Refreshing…", "structura")
              : __("No active notices for this workspace right now.", "structura")}
          </p>
        </Card>
      ) : (
        <ul className="mt-6 space-y-3">
          {sorted.map((notice) => {
            const cta = resolveCta(notice.cta);
            const isPending =
              (acknowledge.isPending && acknowledge.variables?.noticeId === notice.noticeId) ||
              (dismiss.isPending && dismiss.variables?.noticeId === notice.noticeId);
            return (
              <Card key={notice.noticeId} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge intent={SEVERITY_INTENT[notice.severity]}>
                        {categoryLabel(notice.category)}
                      </Badge>
                      {notice.status === "acknowledged" ? (
                        <Badge intent="default">
                          {__("Acknowledged", "structura")}
                        </Badge>
                      ) : null}
                    </div>
                    <h3 className="text-base font-semibold">
                      {resolveCopy(notice.titleKey, notice.bodyParams)}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {resolveCopy(notice.bodyKey, notice.bodyParams)}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {sprintf(
                        // translators: %1$s is a localized "Xm ago" / "Xh ago"
                        // / "Xd ago" string; %2$d is the integer count of times
                        // the notice has been re-upserted (occurrences).
                        __("Last seen %1$s · %2$d occurrences", "structura"),
                        formatRelative(notice.lastSeenAt),
                        notice.occurrences,
                      )}
                      {notice.domain ? ` · ${notice.domain}` : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {cta ? (
                      <a
                        href={cta.href}
                        target={cta.external ? "_blank" : undefined}
                        rel={cta.external ? "noreferrer noopener" : undefined}
                        // `text-white!`: <a> tags inherit WP admin's
                        // global `a { color }`, which otherwise overrides
                        // the white label on the brand fill.
                        className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white! transition hover:bg-brand-500"
                      >
                        {resolveCopy(notice.cta!.labelKey)}
                        {cta.external ? <ExternalLink className="h-3 w-3" aria-hidden /> : null}
                      </a>
                    ) : null}
                    {notice.status === "open" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          acknowledge.mutate({ noticeId: notice.noticeId })
                        }
                      >
                        {__("Acknowledge", "structura")}
                      </Button>
                    ) : null}
                    <Button
                      variant="transparent"
                      size="sm"
                      disabled={isPending}
                      onClick={() => dismiss.mutate({ noticeId: notice.noticeId })}
                    >
                      {__("Dismiss", "structura")}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
};
