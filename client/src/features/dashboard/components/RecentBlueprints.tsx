import { __ } from "@wordpress/i18n";
import { Badge, Card, Tooltip } from "@structura/ui";
import { Edit3, ExternalLink, FileText, Layout } from "lucide-react";
import { useRecentPostsQuery } from "../api/useRecentPostsQuery";
import { postStatusLabel } from "@/features/campaigns/labels";

export const RecentBlueprints = () => {
  const { data: posts = [], isLoading } = useRecentPostsQuery();

  return (
    <Card className="overflow-hidden p-0! shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4 dark:bg-neutral-900">
        <h3 className="m-0! flex! items-center gap-2 text-xs font-bold tracking-widest text-gray-900 uppercase dark:text-white">
          <Layout className="text-brand-600 dark:text-brand-400 h-4 w-4" />
          {__("Recently Architected", "structura")}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-[10px] font-bold tracking-widest text-gray-400 uppercase dark:border-neutral-700 dark:bg-neutral-800">
            <tr>
              <th className="px-6 py-3">{__("Blueprint / Topic", "structura")}</th>
              <th className="px-6 py-3">{__("Persona", "structura")}</th>
              <th className="px-6 py-3">{__("Intelligence", "structura")}</th>
              <th className="px-6 py-3 text-right">{__("Actions", "structura")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
            {posts.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-xs text-gray-400 italic">
                  {__("No blueprints found in the database.", "structura")}
                </td>
              </tr>
            ) : (
              posts.map((post) => (
                <tr
                  key={post.id}
                  className="transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/50"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-neutral-700 dark:bg-neutral-800">
                        {post.thumbnail ? (
                          <img src={post.thumbnail} className="h-full w-full object-cover" alt="" />
                        ) : (
                          <FileText className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                      <div>
                        <div className="leading-tight font-bold text-gray-900 dark:text-white">
                          {post.title}
                          {post.status !== "publish" && (
                            <span className="ml-2 rounded bg-amber-100 px-1 text-[8px] font-black text-amber-700 uppercase">
                              {postStatusLabel(post.status)}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-gray-400 uppercase">
                          {post.date}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="min-w-30 px-6 py-4">{post.author}</td>
                  <td className="px-6 py-4">
                    <Badge variant="solid" intent="indigo">
                      {post.model}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip title={__("Edit Post", "structura")}>
                        <a
                          href={post.edit_link}
                          className="hover:text-brand-600! dark:hover:text-brand-400! p-2 text-gray-400! transition dark:text-neutral-500!"
                        >
                          <Edit3 className="h-4 w-4" />
                        </a>
                      </Tooltip>
                      {post.status === "publish" && (
                        <Tooltip title={__("View Live", "structura")}>
                          <a
                            href={post.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 text-gray-400! transition hover:text-emerald-600! dark:text-neutral-500!"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
