import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import handler from "../api/data.js";
import { collect } from "./collect.mjs";

const realFetch = globalThis.fetch;
const NOW = new Date("2026-10-30T12:00:00Z");

// Answers GraphQL calls like GitHub would, recording each username and date range requested.
function mockGitHub({ missing = [] } = {}) {
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    const { query, variables } = JSON.parse(options.body);
    calls.push(variables);
    if (missing.includes(variables.login)) {
      return Response.json({ data: { user: null }, errors: [{ message: "not found" }] });
    }
    const user = { login: variables.login, name: null, avatarUrl: "", calendar: { contributionCalendar: { weeks: [] } } };
    const data = { user };
    for (const [, alias] of query.matchAll(/\b(w\d+): contributionsCollection/g)) {
      user[alias] = {
        totalCommitContributions: 1,
        totalPullRequestContributions: 0,
        totalPullRequestReviewContributions: 0,
        totalIssueContributions: 0,
        restrictedContributionsCount: 0,
      };
    }
    for (const [, alias] of query.matchAll(/\b(m\d+): search/g)) data[alias] = { issueCount: 0 };
    return Response.json({ data });
  };
  return calls;
}

function mockResponse() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

afterEach(() => { globalThis.fetch = realFetch; });

test("a malformed username is reported without being sent to GitHub", async () => {
  const calls = mockGitHub();
  const data = await collect({ group: "t", members: ["good", 'bad" is:private'] }, "token", NOW);
  assert.deepEqual(data.members.map((m) => m.login), ["good"]);
  assert.deepEqual(data.failed, ['bad" is:private']);
  assert.deepEqual(calls.map((c) => c.login), ["good"]);
});

test("a username that doesn't exist doesn't take down the others", async () => {
  mockGitHub({ missing: ["ghost"] });
  const data = await collect({ group: "t", members: ["ghost", "good"] }, "token", NOW);
  assert.deepEqual(data.members.map((m) => m.login), ["good"]);
  assert.deepEqual(data.failed, ["ghost"]);
});

test("the same username in different cases counts once", async () => {
  const calls = mockGitHub();
  const data = await collect({ group: "t", members: ["Neil", "neil"] }, "token", NOW);
  assert.equal(data.members.length, 1);
  assert.equal(calls.length, 1);
});

test("streak history reaches back further than the nine-week window", async () => {
  const calls = mockGitHub();
  await collect({ group: "t", members: ["good"] }, "token", NOW);
  const days = (NOW - new Date(calls[0].from)) / 86_400_000;
  assert.equal(days, 364);
});

test("handler rejects non-GET methods without calling GitHub", async () => {
  const calls = mockGitHub();
  const res = mockResponse();
  await handler({ method: "POST", url: "/api/data" }, res);
  assert.equal(res.code, 405);
  assert.equal(res.headers.Allow, "GET, HEAD");
  assert.equal(calls.length, 0);
});

test("handler rejects query strings so they can't bypass the cache", async () => {
  const calls = mockGitHub();
  const res = mockResponse();
  await handler({ method: "GET", url: "/api/data?x=1" }, res);
  assert.equal(res.code, 400);
  assert.equal(calls.length, 0);
});

test("handler caches success and never caches or leaks a total failure", async () => {
  mockGitHub();
  const ok = mockResponse();
  await handler({ method: "GET", url: "/api/data" }, ok);
  assert.equal(ok.code, 200);
  assert.match(ok.headers["Cache-Control"], /s-maxage=3600/);

  globalThis.fetch = async () => new Response("secret upstream detail", { status: 401 });
  const originalError = console.error;
  console.error = () => {};
  const failed = mockResponse();
  await handler({ method: "GET", url: "/api/data" }, failed);
  console.error = originalError;
  assert.equal(failed.code, 502);
  assert.equal(failed.headers["Cache-Control"], "no-store");
  assert.deepEqual(failed.body, { error: "Could not load GitHub data" });
});
