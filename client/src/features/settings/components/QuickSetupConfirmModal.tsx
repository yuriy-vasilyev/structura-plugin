import { __ } from "@wordpress/i18n";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button, Dialog } from "@structura/ui";

import type { QuickSetupProposal } from "../api/usePublicSiteProfile";

interface QuickSetupConfirmModalProps {
  open: boolean;
  /**
   * Proposed values from the cloud scrape. `null` while the request is
   * in flight; the modal renders a loading state in that case.
   */
  proposal: QuickSetupProposal | null;
  /**
   * Whether the operator already has values in `description` /
   * `keyPages`. When true, the modal warns that applying will
   * overwrite — a common case when re-running Quick setup after
   * manual edits.
   */
  willOverwrite: boolean;
  loading: boolean;
  onApply: (proposal: QuickSetupProposal) => void;
  onClose: () => void;
}

/**
 * Confirmation modal for the headless-mode "Quick setup" flow. The
 * cloud scrape returns `description` + `keyPages` proposals; this
 * dialog shows them to the operator before any local state changes.
 *
 * Why a confirmation step (rather than auto-applying)
 * ---------------------------------------------------
 * Quick setup is a "best guess" — the scrape can produce a description
 * that's too marketing-heavy for the operator's taste, or pick up nav
 * links that aren't actually the right pages to surface in AI prompts.
 * Showing the proposals first lets the operator either accept them
 * wholesale (the common case) or reject and edit manually.
 *
 * Spec: `specs/site-identity-headless.md` §4.
 */
export const QuickSetupConfirmModal = ({
  open,
  proposal,
  willOverwrite,
  loading,
  onApply,
  onClose,
}: QuickSetupConfirmModalProps) => {
  const handleApply = () => {
    if (proposal) onApply(proposal);
  };

  return (
    <Dialog.Root open={open} onClose={onClose} size="lg">
      <Dialog.Content>
        <Dialog.Header>
          <div className="flex items-center gap-3">
            <Sparkles className="text-brand-500 h-5 w-5" />
            <Dialog.Title>{__("Quick setup proposals", "structura")}</Dialog.Title>
          </div>
          <Dialog.Description>
            {__(
              "Structura scraped your public website. Review what it found before applying — these values will be saved into the form, you can still edit them before clicking Save.",
              "structura"
            )}
          </Dialog.Description>
        </Dialog.Header>

        <Dialog.Body>
          {loading && (
            <div className="flex items-center justify-center py-8">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {__("Scraping your public site…", "structura")}
              </span>
            </div>
          )}

          {!loading && proposal && (
            <div className="space-y-6">
              {willOverwrite && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-900/20">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="m-0! text-xs text-amber-800 dark:text-amber-200">
                    {__(
                      "Applying these proposals will replace your current description and key pages.",
                      "structura"
                    )}
                  </p>
                </div>
              )}

              {/* Description */}
              <div>
                <h4 className="m-0! mb-2 text-xs font-semibold tracking-wider text-gray-700 uppercase dark:text-gray-300">
                  {__("Description", "structura")}
                </h4>
                {proposal.description ? (
                  <p className="m-0! rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                    {proposal.description}
                  </p>
                ) : (
                  <p className="m-0! text-xs text-gray-500 italic dark:text-gray-400">
                    {__(
                      "No description found on the page — you can write one manually.",
                      "structura"
                    )}
                  </p>
                )}
              </div>

              {/* Key pages */}
              <div>
                <h4 className="m-0! mb-2 text-xs font-semibold tracking-wider text-gray-700 uppercase dark:text-gray-300">
                  {__("Key pages", "structura")}{" "}
                  <span className="text-gray-400">({proposal.keyPages.length})</span>
                </h4>
                {proposal.keyPages.length > 0 ? (
                  <ul className="m-0! list-none space-y-1.5 p-0!">
                    {proposal.keyPages.map((page, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {page.label}
                          </span>
                          <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {page.url}
                          </span>
                        </div>
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium tracking-wider text-gray-600 uppercase dark:bg-gray-800 dark:text-gray-400">
                          {page.role.replace("_", " ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0! text-xs text-gray-500 italic dark:text-gray-400">
                    {__(
                      "No nav links matched a known page type — you can add key pages manually.",
                      "structura"
                    )}
                  </p>
                )}
              </div>
            </div>
          )}
        </Dialog.Body>

        <Dialog.Footer>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {__("Cancel", "structura")}
          </Button>
          <Button onClick={handleApply} disabled={loading || !proposal}>
            {__("Apply proposals", "structura")}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};
