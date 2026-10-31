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

// The calendar date (YYYY-MM-DD) of an instant in a time zone.
export function localDate(date, timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function addDays(dateKey, days) {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// The instant a calendar date begins in a time zone. Checked twice because the
// offset guessed at the first estimate can differ across a daylight-saving change.
function zonedMidnight(dateKey, timeZone) {
  const target = Date.parse(`${dateKey}T00:00:00Z`);
  let instant = target;
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
      }).formatToParts(new Date(instant)).map((p) => [p.type, Number(p.value)]),
    );
    const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    instant += target - shown;
  }
  return new Date(instant);
}

// Monday (YYYY-MM-DD) of the week containing `date` in a time zone.
export function weekStart(date, timeZone = "UTC") {
  const today = localDate(date, timeZone);
  const daysSinceMonday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(today, -daysSinceMonday);
}

// `count` consecutive weeks ending with the current one, oldest first.
export function weekRanges(now, count, timeZone = "UTC") {
  const current = weekStart(now, timeZone);
  return Array.from({ length: count }, (_, i) => {
    const key = addDays(current, -(count - 1 - i) * 7);
    return {
      key,
      start: zonedMidnight(key, timeZone),
      end: new Date(zonedMidnight(addDays(key, 7), timeZone).getTime() - 1000),
    };
  });
}

export function points(stats) {
  return Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + (stats[key] ?? 0) * weight, 0);
}

// The days falling within a week, given its Monday as YYYY-MM-DD.
export function daysInWeek(days, start) {
  const end = addDays(start, 6);
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
export function currentStreak(days, today, timeZone = "UTC") {
  const todayKey = localDate(today, timeZone);
  const past = days.filter((d) => d.date <= todayKey).sort((a, b) => a.date.localeCompare(b.date));
  if (past.at(-1)?.date === todayKey && past.at(-1).count === 0) past.pop();
  let streak = 0;
  for (let i = past.length - 1; i >= 0 && past[i].count > 0; i--) streak++;
  return streak;
}

export function longestStreak(days) {
  let longest = 0;
  let run = 0;
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    run = day.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

// Seasons are calendar quarters, e.g. "Q4 2026".
export function seasonOf(dateKey) {
  const [year, month] = dateKey.split("-").map(Number);
  return `Q${Math.ceil(month / 3)} ${year}`;
}

// True when a week falls too late in its quarter for that quarter to have been fully covered.
function startsPartway(dateKey) {
  const [year, month] = dateKey.split("-").map(Number);
  const quarterStart = Date.UTC(year, Math.floor((month - 1) / 3) * 3, 1);
  return Date.parse(`${dateKey}T00:00:00Z`) - quarterStart >= 7 * DAY_MS;
}

// Weekly wins, season standings, and personal bests. Each member's last week is
// still in progress, so it can't award a win. Tied weeks credit everyone tied.
export function buildHistory(members) {
  const weekCount = members[0].weeks.length;
  const currentSeason = seasonOf(members[0].weeks[weekCount - 1].start);
  const seasons = new Map();
  const wins = new Map(members.map((m) => [m.login, { weeklyWins: 0, seasonWins: 0 }]));

  for (let i = 0; i < weekCount; i++) {
    const start = members[0].weeks[i].start;
    const season = seasonOf(start);
    if (!seasons.has(season)) {
      seasons.set(season, { season, partial: i === 0 && startsPartway(start), current: season === currentSeason, totals: new Map() });
    }
    const totals = seasons.get(season).totals;
    for (const m of members) totals.set(m.login, (totals.get(m.login) ?? 0) + m.weeks[i].points);

    if (i === weekCount - 1) continue;
    const top = Math.max(...members.map((m) => m.weeks[i].points));
    if (top === 0) continue;
    for (const m of members) {
      if (m.weeks[i].points !== top) continue;
      wins.get(m.login).weeklyWins++;
      if (season === currentSeason) wins.get(m.login).seasonWins++;
    }
  }

  return {
    trophies: members.map((m) => {
      const best = m.weeks.reduce((a, b) => (b.points > a.points ? b : a));
      return { login: m.login, ...wins.get(m.login), bestWeek: { start: best.start, strain: best.strain }, longestStreak: m.longestStreak };
    }),
    seasons: [...seasons.values()].reverse().map(({ season, partial, current, totals }) => {
      const standings = [...totals].sort((a, b) => b[1] - a[1]);
      const top = standings[0][1];
      return { season, partial, current, points: top, champions: top > 0 ? standings.filter((s) => s[1] === top).map((s) => s[0]) : [] };
    }),
  };
}
