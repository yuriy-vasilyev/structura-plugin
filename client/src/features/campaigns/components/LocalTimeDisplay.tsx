import dayjs from "@/libs/dayjs";

export const LocalTimeDisplay = ({ utcTime }: { utcTime: string }) => {
  // utcTime is "09:00"
  const [hours, minutes] = utcTime.split(":").map(Number);

  // Create a dayjs object in UTC mode for today at the specified time
  const engineTime = dayjs.utc().hour(hours).minute(minutes);

  // Convert to local time and format
  const localFormatted = engineTime.local().format("LT"); // e.g., "10:00 AM"
  const zoneName = dayjs.tz.guess();

  return (
    <span className="ml-2 text-[10px] font-medium text-neutral-400 italic">
      ({localFormatted} {zoneName})
    </span>
  );
};
