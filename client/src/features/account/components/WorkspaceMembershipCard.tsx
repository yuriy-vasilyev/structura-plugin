import { FC } from "react";
import { __, sprintf, _n } from "@wordpress/i18n";
import { Button, Card } from "@structura/ui";
import { ExternalLink, Layers } from "lucide-react";

import { useLicense } from "@/features/settings";

/**
 * "This site is part of workspace X" advisory — Phase 3.7 of
 * `specs/v2/multi-tenant-and-public-api.md`.
 *
 * Renders only when the calling license is bound to a workspace
 * with more than one active activation. Single-activation
 * workspaces stay invisible per spec ("workspace is invisible to
 * single-user installs"). Pre-Phase-3.7 cloud responses don't
 * include the workspace block — we treat that as "no signal" and
 * render nothing rather than guess.
 *
 * Why a card on the Account page rather than a top-level banner:
 * the indicator is informational, not actionable from the WP side
 * (member management, role changes, audience switches all live in
 * the portal). Burying it next to the License Activation card —
 * where the user is already thinking about license/workspace
 * boundaries — matches that intent without claiming attention on
 * every wp-admin page.
 */
export const WorkspaceMembershipCard: FC = () => {
  const { workspace } = useLicense();

  if (!workspace) return null;
  if (workspace.activationsCount <= 1) return null;

  // Sibling count — total minus the current site. Spec wording:
  // "this site is part of {Workspace} alongside {N} other site(s)".
  // The plural-aware string gives translators the count argument
  // so "1 site" / "2 sites" work in every locale via `_n`.
  const siblings = Math.max(0, workspace.activationsCount - 1);

  return (
    <Card className="p-6! shadow-sm">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-violet-50 p-2 ring-1 ring-violet-100 dark:bg-violet-950/30 dark:ring-violet-900/50">
          <Layers className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="m-0! text-[11px] font-bold tracking-widest text-gray-500 uppercase dark:text-gray-400">
            {__("Workspace", "structura")}
          </h3>
          <p className="mt-1! mb-0! truncate text-base font-semibold text-gray-900 dark:text-white">
            {workspace.name}
          </p>
          <p className="mt-1! mb-0! text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {sprintf(
              /* translators: 1: workspace name (interpolated above), 2: number of OTHER sites in the workspace (excludes the current site). */
              _n(
                "This site is part of the workspace alongside %d other site.",
                "This site is part of the workspace alongside %d other sites.",
                siblings,
                "structura"
              ),
              siblings
            )}
          </p>
          <div className="mt-3">
            <Button size="sm" variant="secondary" asChild>
              <a
                href={`https://app.structurawp.com/workspaces/${workspace.id}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                {__("Manage workspace", "structura")}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};
