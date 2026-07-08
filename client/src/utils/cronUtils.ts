import cronstrue from "cronstrue/i18n";
import { __ } from "@wordpress/i18n";

/**
 * Maps WordPress locale to cronstrue supported locales.
 */
const getCronLocale = () => {
  // WordPress usually provides locales like 'en_US', 'de_DE', 'es_ES'
  const wpLocale = (window as any).wp?.i18n?.getLocaleData()?.[""]?.lang || "en";

  // cronstrue supports common codes: 'en', 'de', 'es', 'fr', 'it', 'nl', 'pt_BR', etc.
  return wpLocale.split("_")[0];
};

/**
 * Translates a cron string to a human-readable format.
 */
export const cronToHuman = (cron: string): string => {
  if (!cron) return "";

  try {
    return cronstrue.toString(cron, {
      locale: getCronLocale(),
      use24HourTimeFormat: true,
      throwExceptionOnParseError: true,
    });
  } catch (e) {
    return __("Custom schedule", "structura");
  }
};

/**
 * Deconstructs a cron string for the UI state.
 * Supports: Daily, Weekly, Monthly patterns used in the ScheduleBuilder.
 */
export const parseCronForUi = (cron: string) => {
  try {
    const parts = cron.split(" ");
    if (parts.length < 5) return null;

    const [minute, hour, dayOfMonth, , dayOfWeek] = parts;
    const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;

    // Monthly: Minute Hour DayOfMonth * *
    if (dayOfMonth !== "*" && dayOfWeek === "*") {
      return { frequency: "monthly" as const, time, dayOfMonth: parseInt(dayOfMonth), days: [] };
    }

    // Weekly: Minute Hour * * DayOfWeek
    if (dayOfWeek !== "*") {
      return {
        frequency: "weekly" as const,
        time,
        dayOfMonth: 1,
        days: dayOfWeek.split(",").map(Number),
      };
    }

    // Daily: Minute Hour * * *
    return { frequency: "daily" as const, time, dayOfMonth: 1, days: [] };
  } catch (e) {
    return null;
  }
};
