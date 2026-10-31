import assert from "node:assert/strict";
import { test } from "node:test";
import { addMember, parseRequest } from "./add-friend.mjs";

const FILE = `{
  "group": "The Crew",
  "timeZone": "America/Los_Angeles",
  "members": ["nb110240", "shivaan11"]
}
`;

test("the owner and collaborators can request a friend", () => {
  assert.deepEqual(parseRequest("Add friend: octocat", "OWNER"), { ok: true, login: "octocat" });
  assert.deepEqual(parseRequest("add friend: @octocat ", "COLLABORATOR"), { ok: true, login: "octocat" });
});

test("anyone else is refused, whatever the title says", () => {
  for (const association of ["NONE", "CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "MEMBER", undefined]) {
    assert.equal(parseRequest("Add friend: octocat", association).ok, false);
  }
});

test("titles that aren't a single valid username are refused", () => {
  for (const title of ["Add friend:", "Add friend: two words", 'Add friend: x"; rm -rf /', "Add friend: -bad", "Add friend: $(whoami)", "octocat"]) {
    assert.equal(parseRequest(title, "OWNER").ok, false, title);
  }
});

test("addMember appends and leaves the rest of the file untouched", () => {
  const updated = addMember(FILE, "octocat");
  assert.equal(updated, FILE.replace('"shivaan11"]', '"shivaan11", "octocat"]'));
  assert.deepEqual(JSON.parse(updated).members, ["nb110240", "shivaan11", "octocat"]);
});

test("addMember returns null for an existing member in any case", () => {
  assert.equal(addMember(FILE, "SHIVAAN11"), null);
});
