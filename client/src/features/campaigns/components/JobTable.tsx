import { useDeferredValue, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { Play, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button, Card, ConfirmDialog, InputField, Tooltip } from "@structura/ui";
import { TablePagination } from "@/components/Shared/TablePagination";

import { useJobsQuery } from "@/features/campaigns/api/useJobsQuery";
import { useJobMutations } from "@/features/campaigns/api/useJobMutations";

interface JobTableProps {
  status: "pending" | "failed" | "complete";
  title: string;
  icon: React.ReactNode;
}

const JobTable = ({ status, title, icon }: JobTableProps) => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  // Intent State for ConfirmDialogs
  const [activeAction, setActiveAction] = useState<{
    type: "run" | "retry" | "delete";
    id: number;
    title: string;
  } | null>(null);

  const { data, isLoading, isFetching, refetch } = useJobsQuery(status, page, deferredSearch);

  // Scoped mutations logic
  const { runNow, retry, deleteJob, runMutation, retryMutation, deleteMutation } =
    useJobMutations();

  const jobs = data?.data ?? [];
  const totalPages = data?.pagination?.total_pages ?? 1;
  const isSyncing = isLoading || isFetching;

  // Handler to finalize the confirmed action
  const handleConfirm = async () => {
    if (!activeAction) return;

    const { type, id } = activeAction;

    setActiveAction(null);

    if (type === "run") await runNow(id);
    if (type === "retry") await retry(id);
    if (type === "delete") await deleteJob(id);
  };

  return (
    <>
      <Card className="overflow-hidden border-neutral-200 p-0!">
        {/* Table Header */}
        <div className="flex flex-col justify-between gap-4 border-b border-neutral-100 bg-neutral-50/50 p-5 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <div className="text-neutral-500">{icon}</div>
            <h3 className="mb-0! text-sm font-black tracking-tight text-neutral-900 uppercase">
              {title}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-64">
              <InputField
                label={__("Filter tasks", "structura")}
                hiddenLabel
                value={search}
                placeholder={__("Filter tasks...", "structura")}
                onChange={(e) => setSearch(e.target.value)}
                leftAdornment={<Search className="size-3.5 text-neutral-400" />}
              />
            </div>
            <Button variant="secondary" onClick={() => refetch()} disabled={isSyncing}>
              <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>

        {/* Table Content */}
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-100 bg-white text-[10px] font-black tracking-widest text-neutral-400 uppercase">
              <tr>
                <th className="px-6 py-4">{__("Blueprint / Campaign", "structura")}</th>
                {status === "failed" && (
                  <th className="px-6 py-4">{__("Architect Error", "structura")}</th>
                )}
                <th className="px-6 py-4">{__("Execution Time", "structura")}</th>
                <th className="px-6 py-4 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {jobs.length === 0 && !isLoading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-xs text-neutral-400 italic"
                  >
                    {__("No tasks found in this state.", "structura")}
                  </td>
                </tr>
              ) : (
                jobs.map((job) => {
                  // SCOPED BUSY STATES
                  // We check if the mutation is pending AND if the ID matches the current row
                  const isThisJobRunning =
                    runMutation.isPending && runMutation.variables === job.campaign_id;
                  const isThisJobRetrying =
                    retryMutation.isPending && retryMutation.variables === job.id;
                  const isThisJobDeleting =
                    deleteMutation.isPending && deleteMutation.variables === job.id;
                  const isAnyRowBusy = isThisJobRunning || isThisJobRetrying || isThisJobDeleting;

                  return (
                    <tr key={job.id} className="group transition-colors hover:bg-neutral-50/50">
                      <td className="px-6 py-4">
                        <div className="max-w-50 truncate font-bold text-neutral-900">
                          {job.campaign_name}
                        </div>
                        <div className="text-[10px] font-bold tracking-tighter text-neutral-400 uppercase">
                          {job.model_slug}
                        </div>
                      </td>

                      {status === "failed" && (
                        <td className="px-6 py-4">
                          <Tooltip title={job.error}>
                            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 font-mono text-xs font-medium">
                              {job.error}
                            </div>
                          </Tooltip>
                        </td>
                      )}

                      <td className="min-w-40 px-6 py-4 font-mono text-[11px] text-neutral-400">
                        {job.formatted_date ?? __("As soon as possible", "structura")}
                      </td>

                      <td className="min-w-30 space-x-1 px-6 py-4 text-right">
                        {status === "pending" && (
                          <button
                            disabled={isAnyRowBusy}
                            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-neutral-400 transition-all hover:bg-emerald-50 hover:text-emerald-500 disabled:opacity-30"
                            onClick={() =>
                              setActiveAction({
                                type: "run",
                                id: job.campaign_id,
                                title: job.campaign_name,
                              })
                            }
                          >
                            {isThisJobRunning ? (
                              <RefreshCw className="size-4 animate-spin" />
                            ) : (
                              <Play className="size-4" />
                            )}
                          </button>
                        )}

                        {status === "failed" && (
                          <button
                            disabled={isAnyRowBusy}
                            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-neutral-400 transition-all hover:bg-brand-50 hover:text-brand-600 disabled:opacity-30"
                            onClick={() =>
                              setActiveAction({
                                type: "retry",
                                id: job.id,
                                title: job.campaign_name,
                              })
                            }
                          >
                            {isThisJobRetrying ? (
                              <RefreshCw className="size-4 animate-spin" />
                            ) : (
                              <RefreshCw className="size-4" />
                            )}
                          </button>
                        )}

                        <button
                          disabled={isAnyRowBusy}
                          onClick={() =>
                            setActiveAction({
                              type: "delete",
                              id: job.id,
                              title: job.campaign_name,
                            })
                          }
                          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-neutral-400 transition-all hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
                        >
                          {isThisJobDeleting ? (
                            <RefreshCw className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </Card>

      {/* SHARED CONFIRMATION DIALOG */}
      <ConfirmDialog
        isOpen={!!activeAction}
        onClose={() => setActiveAction(null)}
        onConfirm={handleConfirm}
        variant={activeAction?.type === "delete" ? "danger" : "primary"}
        title={
          activeAction?.type === "delete"
            ? __("Purge Production Job?", "structura")
            : activeAction?.type === "retry"
              ? __("Retry Architect Step?", "structura")
              : __("Execute Immediately?", "structura")
        }
        description={sprintf(
          __(
            "You are about to modify the execution roadmap for: %s. This action cannot be undone.",
            "structura"
          ),
          activeAction?.title ?? ""
        )}
        confirmButtonProps={{
          label:
            activeAction?.type === "delete"
              ? __("Delete Forever", "structura")
              : __("Proceed", "structura"),
        }}
      />
    </>
  );
};

export default JobTable;
