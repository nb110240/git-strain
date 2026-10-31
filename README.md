# Git Strain

A Whoop-style weekly leaderboard for a group of friends on GitHub. Everyone gets a 0–21 strain score based on their commits, pull requests, reviews, and issues, so you can see who's shipping the most this week.

**Live board:** <https://git-strain.vercel.app>

## Features

- **Weekly ranking:** a strain ring, points total, and current streak for each member.
- **Side-by-side breakdown:** commits, PRs opened and merged, reviews, issues, and private contributions per person.
- **Nine weeks of history:** a trend chart, plus a picker for viewing any past week.
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

Members and the group name live in [`members.json`](members.json):

```json
{
  "group": "The Crew",
  "members": ["nb110240", "friend-one", "friend-two"]
}
```

Redeploy after changing it. The live page can take up to an hour to update because of the cache. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full process.

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

Weeks run Monday to Sunday UTC. A streak is the number of consecutive days with at least one contribution, up to a maximum of one year, and having no activity yet today doesn't break it. The current week is unfinished, so its cards show last week's score instead of a change.

To tune the scoring, edit `WEIGHTS` and `STRAIN_SCALE` in [`lib/scoring.mjs`](lib/scoring.mjs). The explanation at the bottom of [`public/index.html`](public/index.html) should be updated to match.

## Deploying to Vercel

1. Create a [classic GitHub token](https://github.com/settings/tokens/new) with **no scopes selected**. It only needs to read public data.
2. Link the project and add the token. Paste it when prompted:

   ```bash
   npx vercel link
   ```

   ```bash
   npx vercel env add GITHUB_TOKEN production
   ```

3. Deploy:

   ```bash
   npx vercel --prod
   ```

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

Each member takes one GraphQL request. If one username fails, the rest of the board still loads, the page shows a warning naming the failed user, and the result is cached for only 5 minutes so the failure can clear quickly. After the hour is up, visitors briefly see the older data while a fresh copy loads in the background.

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
- **Weeks use UTC:** late Sunday activity in US time zones lands in the next week.
- **Score isn't output:** it measures activity, not the quality or value of the work.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Couldn't load the leaderboard data" | `GITHUB_TOKEN` is missing or expired, or every username failed | Check the variable with `npx vercel env ls`, replace the token if needed, and redeploy |
| "Couldn't load: *username*" | Username is misspelled or the account no longer exists | Correct it in `members.json` and redeploy |
| A member shows zero despite being busy | Their work is in private repos | Have them turn on **Private contributions** |
| A new member isn't showing | Change isn't deployed, or the cache hasn't refreshed | Redeploy and allow up to an hour |
