# Git Strain

A Whoop-style weekly leaderboard for a group of friends on GitHub. Everyone gets a 0–21 strain score based on their commits, pull requests, reviews, and issues, so you can see who's shipping the most this week.

**Live board:** <https://git-strain.vercel.app>

## Features

- **Weekly ranking:** a strain ring, points total, and current streak for each member.
- **Side-by-side breakdown:** commits, PRs opened and merged, reviews, issues, and private contributions per person.
- **Head to head:** pick any two people to see their win-loss record and compare any week side by side.
- **Trophies and seasons:** weekly wins, best weeks, longest streaks, and a champion for each calendar quarter.
- **A year of history:** a nine-week trend chart, plus a picker for viewing any of the last 52 weeks.
- **Shared time zone:** weeks and streaks follow one time zone set for the group.
- **No sign-up:** friends are added by GitHub username. They don't need an account or a token.
- **No database:** data is fetched live from GitHub and cached by Vercel's CDN.

## Quick start

Requires Node.js 20 or later and the [GitHub CLI](https://cli.github.com/), logged in with `gh auth login`.

```bash
git clone https://github.com/nb110240/git-strain.git
```

```bash
cd git-strain
```

```bash
npm run preview
```

Then open <http://localhost:4173>. There are no dependencies to install.

To try other usernames without editing `members.json`, set `PREVIEW_MEMBERS` to a comma-separated list before starting the preview:

```bash
PREVIEW_MEMBERS=torvalds,sindresorhus npm run preview
```

In Windows PowerShell, set the variable first with `$env:PREVIEW_MEMBERS = "torvalds,sindresorhus"`, then run `npm run preview`.

To run the tests:

```bash
npm test
```

## Managing the group

Members, the group name, and the time zone live in [`members.json`](members.json):

```json
{
  "group": "The Crew",
  "timeZone": "America/Los_Angeles",
  "members": ["nb110240", "friend-one", "friend-two"]
}
```

`timeZone` takes any [IANA time zone name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) and defaults to UTC if left out.

Changes pushed to `main` deploy automatically. The live page can take up to an hour to update because of the cache. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full process.

### Counting private work

GitHub only shares private activity if the account owner allows it. Each member who wants it counted should open their GitHub profile, select **Contribution settings**, and turn on **Private contributions**.

Without this setting, that person's private work scores zero, which can make someone who works mostly in private repos look inactive.

GitHub reports private work as one total covering commits, PRs, reviews, and issues. It can't be split out, so someone who works mostly in private repos will show a large **Private** number and near-zero everywhere else. Their score is still correct, but each private PR or review earns 1 point rather than its usual weight.

## How scoring works

Each week, activity is converted to points:

| Activity | Points |
| --- | --- |
| Commit | 1 |
| Pull request opened | 4 |
| Pull request merged | 2 |
| Pull request review | 3 |
| Issue opened | 1 |
| Private contribution | 1 |

PRs and reviews are worth more than commits so that squash-merge habits and helping teammates aren't penalized.

Two rules then favor steady work over raw volume:

- **Daily cap:** contributions above 20 in a single day score nothing, shown in the **Over cap** column. A burst of automated commits can't buy the top spot.
- **Active-day bonus:** each day with any activity earns 5 points, shown in the **Active days** column.

So a week's total is:

```text
points = (weighted activity − over cap) + (active days × 5)
```

Points are then converted to strain:

```text
strain = 21 × (1 − e^(−points / 120))
```

Each extra point counts for less as the week gets busier, so one huge week can't dominate the chart:

| Points | Strain |
| --- | --- |
| 25 | 3.9 |
| 50 | 7.2 |
| 100 | 11.9 |
| 200 | 17.0 |
| 400 | 20.3 |

Weeks run Monday to Sunday in the group's time zone. A streak is the number of consecutive days with at least one contribution, up to a maximum of one year, and having no activity yet today doesn't break it. The current week is unfinished, so its cards show last week's score instead of a change.

To tune the scoring, edit `WEIGHTS`, `DAILY_CAP`, `ACTIVE_DAY_BONUS`, and `STRAIN_SCALE` in [`lib/scoring.mjs`](lib/scoring.mjs). The explanation at the bottom of [`public/index.html`](public/index.html) should be updated to match.

### Trophies, seasons, and head to head

- **Weekly win:** the most points in a finished week. Ties credit everyone tied, the unfinished current week doesn't count, and a week where nobody scored has no winner.
- **Season:** a calendar quarter, based on the date of each week's Monday. The champion has the most total points. A season marked **Partial data** began before the 52-week window, so only part of it counted.
- **Head-to-head record:** finished weeks won by each person, plus ties. Weeks where neither person scored are skipped.

Nothing is stored. History is recalculated from GitHub, so it covers the last 52 weeks only. Changing the scoring rules, or a member changing their private contributions setting, also changes past results, and members get credit for weeks before they joined the group.

## Deploying to Vercel

1. Create a [classic GitHub token](https://github.com/settings/tokens/new) with **no scopes selected**. It only needs to read public data.
2. Link the project and add the token. Paste it when prompted:

   ```bash
   npx vercel link
   ```

   ```bash
   npx vercel env add GITHUB_TOKEN production
   ```

3. Deploy once by hand:

   ```bash
   npx vercel --prod
   ```

After that, every push to `main` deploys to production automatically, because the Vercel project is connected to this repo. To set that up on a new project, open its **Settings**, then **Git**, and connect the repository. Pull requests get preview deployments, but those show a loading error unless `GITHUB_TOKEN` is also added for the preview environment.

There's no build step. Vercel serves `public/` as static files and `api/data.js` as a serverless function, and `vercel.json` adds security headers.

| Environment variable | Required | Description |
| --- | --- | --- |
| `GITHUB_TOKEN` | On Vercel | Token used for GitHub API calls. Locally, the `gh` CLI's token is used if this isn't set. |
| `PREVIEW_MEMBERS` | No | Comma-separated usernames that replace `members.json`. Local preview only. |

## How it works

```text
Browser ──> /api/data ──> Vercel CDN (cached for 1 hour)
                              │ on a cache miss
                              ▼
                        api/data.js ──> GitHub GraphQL API
```

Each member takes five GraphQL requests: one for their profile and contribution calendar, and four for the year of weekly totals. A cache miss takes about 4 seconds for 2 members and 9 seconds for 15. If one username fails, the rest of the board still loads, the page shows a warning naming the failed user, and the result is cached for only 5 minutes so the failure can clear quickly. After the hour is up, visitors briefly see the older data while a fresh copy loads in the background.

The endpoint only accepts `GET` and `HEAD` requests without query parameters, so nobody can bypass the cache to use up the token's GitHub API limit.

```text
api/data.js            Serverless endpoint and cache headers
lib/collect.mjs        GitHub queries and data assembly
lib/scoring.mjs        Weeks, points, strain, and streaks
lib/*.test.mjs         Unit tests, using a mocked GitHub API
public/index.html      The leaderboard page
scripts/serve.mjs      Local preview server
members.json           Group name and member list
vercel.json            Security headers
```

## Privacy

The page is public to anyone with the link, because the deployment has no login. It only shows:

- Public profile details: name, username, and avatar.
- Activity counts, with no repo names, commit messages, or PR titles.
- An anonymous total of private contributions, for members who have chosen to share it.

## Known limitations

- **The token owner sees their own private total regardless of the setting:** GitHub always shows you your own activity, so the person whose token runs the site gets their private work counted even with **Private contributions** off. They should turn it on so that everyone is measured under the same rule.
- **Private work is one lump:** see [Counting private work](#counting-private-work).
- **Commit counts come from GitHub's contribution rules:** commits only count if they're on the default branch or `gh-pages`, and use an email linked to the account.
- **One time zone for everyone:** members far from the group's time zone may see late Sunday activity land in the next week. GitHub also decides which day a contribution falls on, so daily caps and streaks can differ slightly from the group's time zone near midnight.
- **Score isn't output:** it measures activity, not the quality or value of the work.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Couldn't load the leaderboard data" | `GITHUB_TOKEN` is missing or expired, or every username failed | Check the variable with `npx vercel env ls`, replace the token if needed, and redeploy with `npx vercel --prod` |
| "Couldn't load: *username*" | Username is misspelled or the account no longer exists | Correct it in `members.json` and push to `main` |
| A member shows zero despite being busy | Their work is in private repos | Have them turn on **Private contributions** |
| A new member isn't showing | Change isn't on `main`, or the cache hasn't refreshed | Check the deployment in Vercel and allow up to an hour |
