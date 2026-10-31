const DAY_MS = 86_400_000;

// Points per unit of activity. Reviews and PRs outweigh commits so that squash
// workflows and helping teammates aren't penalised against many small commits.
export const WEIGHTS = { commits: 1, prsOpened: 4, prsMerged: 2, reviews: 3, issues: 1, privateWork: 1 };

// Contributions above this in one day score nothing, so bursts and automation can't buy the top spot.
export const DAILY_CAP = 20;
// Added per day with any activity, so showing up consistently beats one big day.
export const ACTIVE_DAY_BONUS = 5;

const STRAIN_MAX = 21;
const STRAIN_SCALE = 120; // Points at which strain reaches ~63% of the maximum.

const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

export function isValidLogin(login) {
  return typeof login === "string" && LOGIN_PATTERN.test(login);
}

// Monday 00:00 UTC of the week containing `date`.
export function weekStart(date) {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(midnight - daysSinceMonday * DAY_MS);
}

// `count` consecutive weeks ending with the current one, oldest first.
export function weekRanges(now, count) {
  const current = weekStart(now).getTime();
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(current - (count - 1 - i) * 7 * DAY_MS);
    return { start, end: new Date(start.getTime() + 7 * DAY_MS - 1000) };
  });
}

export function points(stats) {
  return Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + (stats[key] ?? 0) * weight, 0);
}

// The days falling within a week, given its Monday as YYYY-MM-DD.
export function daysInWeek(days, start) {
  const end = new Date(Date.parse(`${start}T00:00:00Z`) + 6 * DAY_MS).toISOString().slice(0, 10);
  return days.filter((d) => d.date >= start && d.date <= end);
}

// Weighted activity, minus anything over the daily cap, plus the active-day bonus.
export function weekScore(stats, days) {
  const activeDays = days.filter((d) => d.count > 0).length;
  const overCap = days.reduce((sum, d) => sum + Math.max(0, d.count - DAILY_CAP), 0);
  return { activeDays, overCap, points: Math.max(0, points(stats) - overCap) + activeDays * ACTIVE_DAY_BONUS };
}

// Diminishing-returns 0-21 scale, so one huge week can't dwarf everyone forever.
export function strain(pointTotal) {
  return Math.round(STRAIN_MAX * (1 - Math.exp(-pointTotal / STRAIN_SCALE)) * 10) / 10;
}

// Consecutive active days ending today. Today not being active yet doesn't break it.
export function currentStreak(days, today) {
  const todayKey = today.toISOString().slice(0, 10);
  const past = days.filter((d) => d.date <= todayKey).sort((a, b) => a.date.localeCompare(b.date));
  if (past.at(-1)?.date === todayKey && past.at(-1).count === 0) past.pop();
  let streak = 0;
  for (let i = past.length - 1; i >= 0 && past[i].count > 0; i--) streak++;
  return streak;
}
