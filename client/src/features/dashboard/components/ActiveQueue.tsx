import { __, sprintf } from "@wordpress/i18n";
import { Badge, Card } from "@structura/ui";
import { CalendarClock } from "lucide-react";
import { Job } from "@/features/campaigns";
import { jobStatusLabel } from "@/features/campaigns/labels";

export const ActiveQueue = ({ jobs }: { jobs: Job[] }) => {
  return (
    <Card className="overflow-hidden p-0! shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <h3 className="m-0! flex! items-center gap-2 text-xs font-bold tracking-widest text-gray-900 uppercase">
          <CalendarClock className="h-4 w-4 text-amber-500" />
          {__("Active Generation Queue", "structura")}
        </h3>
        <span className="text-[10px] font-bold text-gray-400 uppercase">
          {sprintf(__("%d Tasks Remaining", "structura"), jobs.length)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-[10px] font-bold tracking-widest text-gray-400 uppercase">
            <tr>
              <th className="px-6 py-4">{__("Blueprint Topic", "structura")}</th>
              <th className="px-6 py-4">{__("Intelligence", "structura")}</th>
              <th className="px-6 py-4">{__("Status", "structura")}</th>
              <th className="px-6 py-4 text-right">{__("Scheduled", "structura")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-xs text-gray-400 italic">
                  {__("Queue is currently empty.", "structura")}
                </td>
              </tr>
            ) : (
              jobs.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-amber-50/30">
                  <td className="px-6 py-4 font-bold text-gray-900">{item.campaign_name}</td>
                  <td className="px-6 py-4 font-mono text-[10px] text-gray-500">
                    {item.model_slug}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="solid" intent="info">
                      {jobStatusLabel(item.status)}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right text-xs font-medium text-gray-500">
                    {item.formatted_date}
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
