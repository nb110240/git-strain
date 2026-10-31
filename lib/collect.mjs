// Fetches weekly GitHub activity for a list of members.
import { currentStreak, daysInWeek, isValidLogin, strain, weekRanges, weekScore } from "./scoring.mjs";

const WEEKS = 9;
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

function buildQuery(login, ranges) {
  const weeks = ranges.map((range, i) => {
    const from = range.start.toISOString();
    const to = range.end.toISOString();
    // is:public keeps counts token-independent; private PRs already land in restrictedContributionsCount.
    const search = `author:${login} is:pr is:public is:merged merged:${from}..${to}`;
    return {
      contributions: `w${i}: contributionsCollection(from: "${from}", to: "${to}") {
        totalCommitContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        totalIssueContributions
        restrictedContributionsCount
      }`,
      merged: `m${i}: search(query: "${search}", type: ISSUE, first: 0) { issueCount }`,
    };
  });
  return `query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      login
      name
      avatarUrl(size: 160)
      calendar: contributionsCollection(from: $from, to: $to) {
        contributionCalendar { weeks { contributionDays { date contributionCount } } }
      }
      ${weeks.map((w) => w.contributions).join("\n")}
    }
    ${weeks.map((w) => w.merged).join("\n")}
  }`;
}

async function fetchMember(token, login, ranges, now) {
  const data = await graphql(token, buildQuery(login, ranges), {
    login,
    from: new Date(now.getTime() - STREAK_LOOKBACK_DAYS * 86_400_000).toISOString(),
    to: now.toISOString(),
  });
  if (!data.user) throw new Error("user not found");

  const days = data.user.calendar.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }));

  const weeks = ranges.map((range, i) => {
    const c = data.user[`w${i}`];
    const stats = {
      commits: c.totalCommitContributions,
      prsOpened: c.totalPullRequestContributions,
      prsMerged: data[`m${i}`].issueCount,
      reviews: c.totalPullRequestReviewContributions,
      issues: c.totalIssueContributions,
      privateWork: c.restrictedContributionsCount,
    };
    const start = range.start.toISOString().slice(0, 10);
    const score = weekScore(stats, daysInWeek(days, start));
    return { start, ...stats, ...score, strain: strain(score.points) };
  });

  return {
    login: data.user.login,
    name: data.user.name,
    avatarUrl: data.user.avatarUrl,
    streak: currentStreak(days, now),
    weeks,
  };
}

export async function collect({ group, members: listed }, token, now = new Date()) {
  // GitHub usernames are case-insensitive, so "Neil" and "neil" are one person.
  const unique = [...new Map(listed.map((m) => [String(m).toLowerCase(), m])).values()];
  const logins = unique.filter(isValidLogin);
  const failed = unique.filter((m) => !isValidLogin(m));

  const ranges = weekRanges(now, WEEKS);
  const results = await Promise.allSettled(logins.map((login) => fetchMember(token, login, ranges, now)));
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
  return { group, generatedAt: now.toISOString(), failed, members };
}
