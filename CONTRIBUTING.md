# Contributing

## Join the group

1. Add your GitHub username to `members` in [`members.json`](members.json).
2. Open a pull request, or send your username to the repo owner.
3. Optional: to have private work counted, open your GitHub profile, select **Contribution settings**, and turn on **Private contributions**. Only an anonymous total is shared.

Your stats appear after the next production deploy. Deploys are run manually, and the page can take up to an hour to refresh.

## Make a code change

The project has no dependencies, so there's nothing to install. You need Node.js 20 or later and a logged-in [GitHub CLI](https://cli.github.com/).

1. Create a branch.
2. Make your change and check it in the browser:

   ```bash
   npm run preview
   ```

3. Run the tests:

   ```bash
   npm test
   ```

4. Open a pull request that explains what changed and why.

## Guidelines

- **Keep it dependency-free:** the project runs on Node and browser built-ins, so check with the owner before adding a package.
- **Test scoring changes:** logic in `lib/scoring.mjs` should have matching tests in `lib/scoring.test.mjs`.
- **Keep the docs in step:** if you change scoring, update both the README and the explanation at the bottom of `public/index.html`.
- **Never commit tokens:** keep them in `.env.local`, which is ignored by git, or in Vercel's environment variables.
- **Render GitHub data as text:** display names are written by users, so use `textContent` and never `innerHTML`.
- **Validate usernames:** they're inserted into GitHub search queries, so keep the `isValidLogin` check in place.
