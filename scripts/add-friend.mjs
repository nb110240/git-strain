// Run by .github/workflows/add-friend.yml. Updates members.json and reports the result through GITHUB_OUTPUT.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { addMember, parseRequest } from "../lib/add-friend.mjs";

function finish(message, changedLogin = "") {
  appendFileSync(process.env.GITHUB_OUTPUT, `message=${message}\nlogin=${changedLogin}\n`);
  process.exit(0);
}

const request = parseRequest(process.env.ISSUE_TITLE, process.env.ISSUE_AUTHOR_ASSOCIATION);
if (!request.ok) finish(request.message);

const res = await fetch(`https://api.github.com/users/${request.login}`, {
  headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, "User-Agent": "git-strain" },
});
if (res.status === 404) finish(`Couldn't find a GitHub user called ${request.login}. Check the spelling and try again.`);
if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
const { login, type } = await res.json();
if (type !== "User") finish(`${login} is an organization, and only personal accounts can join.`);

const updated = addMember(readFileSync("members.json", "utf8"), login);
if (updated === null) finish(`${login} is already in the group.`);

writeFileSync("members.json", updated);
finish(`Added ${login}. They'll appear on https://git-strain.vercel.app in a minute or two.`, login);
