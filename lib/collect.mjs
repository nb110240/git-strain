// Fetches a year of weekly GitHub activity for a list of members.
import { buildHistory, currentStreak, daysInWeek, isValidLogin, longestStreak, strain, weekRanges, weekScore } from "./scoring.mjs";

// 52 weeks always fit inside the 364-day calendar below, so every week can apply the daily cap.
const WEEKS = 52;
const WEEKS_PER_REQUEST = 13; // Larger queries risk GitHub's request timeout.
const STREAK_LOOKBACK_DAYS = 364; // GitHub allows at most a one-year span per query.

async function graphql(token, query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "git-strain" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const body = await res.json();
  if (body.errors?.length && !body.data?.user) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data;
}

const PROFILE_QUERY = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    login
    name
    avatarUrl(size: 160)
    calendar: contributionsCollection(from: $from, to: $to) {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
}`;

// `entries` pairs each week's range with its position in the full list, used as its alias.
function buildWeeksQuery(login, entries) {
  const weeks = entries.map(({ range, index }) => {
    const from = range.start.toISOString();
    const to = range.end.toISOString();
    // is:public keeps counts token-independent; private PRs already land in restrictedContributionsCount.
    const search = `author:${login} is:pr is:public is:merged merged:${from}..${to}`;
    return {
      contributions: `w${index}: contributionsCollection(from: "${from}", to: "${to}") {
        totalCommitContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        totalIssueContributions
        restrictedContributionsCount
      }`,
      merged: `m${index}: search(query: "${search}", type: ISSUE, first: 0) { issueCount }`,
    };
  });
  return `query($login: String!) {
    user(login: $login) {
      ${weeks.map((w) => w.contributions).join("\n")}
    }
    ${weeks.map((w) => w.merged).join("\n")}
  }`;
}

async function fetchMember(token, login, ranges, now, timeZone) {
  const profile = await graphql(token, PROFILE_QUERY, {
    login,
    from: new Date(now.getTime() - STREAK_LOOKBACK_DAYS * 86_400_000).toISOString(),
    to: now.toISOString(),
  });
  if (!profile.user) throw new Error("user not found");

  const entries = ranges.map((range, index) => ({ range, index }));
  const batches = [];
  for (let i = 0; i < entries.length; i += WEEKS_PER_REQUEST) batches.push(entries.slice(i, i + WEEKS_PER_REQUEST));
  const results = await Promise.all(batches.map((batch) => graphql(token, buildWeeksQuery(login, batch), { login })));
  const merged = Object.assign({}, ...results);
  const collections = Object.assign({}, ...results.map((r) => r.user));

  const days = profile.user.calendar.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }));

  const weeks = ranges.map((range, i) => {
    const c = collections[`w${i}`];
    const stats = {
      commits: c.totalCommitContributions,
      prsOpened: c.totalPullRequestContributions,
      prsMerged: merged[`m${i}`].issueCount,
      reviews: c.totalPullRequestReviewContributions,
      issues: c.totalIssueContributions,
      privateWork: c.restrictedContributionsCount,
    };
    const score = weekScore(stats, daysInWeek(days, range.key));
    return { start: range.key, ...stats, ...score, strain: strain(score.points) };
  });

  return {
    login: profile.user.login,
    name: profile.user.name,
    avatarUrl: profile.user.avatarUrl,
    streak: currentStreak(days, now, timeZone),
    longestStreak: longestStreak(days),
    weeks,
  };
}

export async function collect({ group, members: listed, timeZone = "UTC" }, token, now = new Date()) {
  // GitHub usernames are case-insensitive, so "Neil" and "neil" are one person.
  const unique = [...new Map(listed.map((m) => [String(m).toLowerCase(), m])).values()];
  const logins = unique.filter(isValidLogin);
  const failed = unique.filter((m) => !isValidLogin(m));

  const ranges = weekRanges(now, WEEKS, timeZone);
  const results = await Promise.allSettled(logins.map((login) => fetchMember(token, login, ranges, now, timeZone)));
  const members = [];
  results.forEach((result, i) => {
    // One bad username shouldn't take the board down for everyone else.
    if (result.status === "fulfilled") members.push(result.value);
    else {
      console.error(`Skipping ${logins[i]}: ${result.reason.message}`);
      failed.push(logins[i]);
    }
  });
  if (!members.length) throw new Error("No member data could be fetched");
  return { group, timeZone, generatedAt: now.toISOString(), failed, members, ...buildHistory(members) };
}
