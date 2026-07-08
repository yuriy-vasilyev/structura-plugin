/**
 * Converts a "posts per week" or "posts per month" frequency into a
 * cron expression with randomized publishing times (humanized jitter).
 *
 * This avoids the robotic "every day at 9:00 AM sharp" pattern that both
 * Google and readers can detect as automated content. Instead, posts land
 * at varied but reasonable times across the week.
 */

import { _n, sprintf } from "@wordpress/i18n";

type FrequencyUnit = "week" | "month";

interface HumanizedScheduleResult {
  cron: string;
  /** Human-readable summary, e.g. "3 posts per week at varied times" */
  description: string;
}

/**
 * Generates a random integer between min (inclusive) and max (inclusive).
 * Uses Math.random — good enough for jitter, not crypto.
 */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Picks `count` unique random items from an array.
 */
function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

/**
 * All 7 days of the week (cron values: 0=Sun, 1=Mon, ..., 6=Sat).
 * We prefer weekdays for business content, so we weight Mon–Fri.
 */
const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Generates a humanized cron expression for the given frequency.
 *
 * Weekly mode (1–7 posts/week):
 * - Picks N days from the week (prefers weekdays for ≤5, includes weekends for 6–7)
 * - Assigns a random time between 7:00–11:00 or 13:00–17:00 (business-ish hours)
 *
 * Monthly mode (1–4 posts/month):
 * - Picks N days spread across the month (roughly evenly spaced)
 * - Uses a single random time
 */
export function generateHumanizedSchedule(
  postsPerPeriod: number,
  unit: FrequencyUnit
): HumanizedScheduleResult {
  if (unit === "week") {
    return generateWeeklySchedule(postsPerPeriod);
  }
  return generateMonthlySchedule(postsPerPeriod);
}

function generateWeeklySchedule(postsPerWeek: number): HumanizedScheduleResult {
  const count = Math.max(1, Math.min(postsPerWeek, 7));

  // Pick days: prefer weekdays for ≤5, add weekends for 6-7
  let selectedDays: number[];
  if (count <= 5) {
    selectedDays = pickRandom(WEEKDAYS, count);
  } else {
    // All weekdays + pick from weekends
    selectedDays = [...WEEKDAYS, ...pickRandom([0, 6], count - 5)];
  }

  selectedDays.sort((a, b) => a - b);

  // Pick a random publishing hour in business-friendly ranges
  // Morning slot: 7:00–11:00, Afternoon slot: 13:00–17:00
  const isMorning = Math.random() > 0.4; // Slight morning preference
  const hour = isMorning ? randInt(7, 11) : randInt(13, 17);
  const minute = randInt(0, 59);

  const cron = `${minute} ${hour} * * ${selectedDays.join(",")}`;
  const description = sprintf(
    // translators: %d is the number of posts per week.
    _n("%d post per week", "%d posts per week", count, "structura"),
    count
  );

  return { cron, description };
}

function generateMonthlySchedule(postsPerMonth: number): HumanizedScheduleResult {
  const count = Math.max(1, Math.min(postsPerMonth, 4));

  // Space days roughly evenly across the month
  const spacing = Math.floor(28 / count);
  const days: number[] = [];
  for (let i = 0; i < count; i++) {
    const base = 1 + i * spacing;
    // Add a small jitter (±2 days) to avoid perfect spacing
    const jittered = Math.max(1, Math.min(28, base + randInt(-2, 2)));
    days.push(jittered);
  }

  // Deduplicate and sort
  const uniqueDays = [...new Set(days)].sort((a, b) => a - b);

  const isMorning = Math.random() > 0.4;
  const hour = isMorning ? randInt(7, 11) : randInt(13, 17);
  const minute = randInt(0, 59);

  const cron = `${minute} ${hour} ${uniqueDays.join(",")} * *`;
  const description = sprintf(
    // translators: %d is the number of posts per month.
    _n("%d post per month", "%d posts per month", count, "structura"),
    count
  );

  return { cron, description };
}

/**
 * Parses a simple frequency string like "3/week" or "2/month" into components.
 * Returns null if the cron doesn't match a humanized pattern.
 */
export function parseSimpleFrequency(cron: string): {
  count: number;
  unit: FrequencyUnit;
} | null {
  if (!cron) return null;

  const parts = cron.split(" ");
  if (parts.length < 5) return null;

  const [, , dayOfMonth, , dayOfWeek] = parts;

  // Weekly pattern: * * DOW
  if (dayOfMonth === "*" && dayOfWeek !== "*") {
    const days = dayOfWeek.split(",").filter(Boolean);
    return { count: days.length, unit: "week" };
  }

  // Monthly pattern: DOM * *
  if (dayOfMonth !== "*" && dayOfWeek === "*") {
    const days = dayOfMonth.split(",").filter(Boolean);
    return { count: days.length, unit: "month" };
  }

  // Daily pattern: * * *
  if (dayOfMonth === "*" && dayOfWeek === "*") {
    return { count: 7, unit: "week" };
  }

  return null;
}
