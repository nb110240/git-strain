import assert from "node:assert/strict";
import { test } from "node:test";
import { currentStreak, daysInWeek, isValidLogin, points, strain, weekRanges, weekScore, weekStart } from "./scoring.mjs";

test("daysInWeek includes Monday and Sunday but not the days around them", () => {
  const dates = ["2026-10-25", "2026-10-26", "2026-11-01", "2026-11-02"];
  const days = dates.map((date) => ({ date, count: 1 }));
  assert.deepEqual(daysInWeek(days, "2026-10-26").map((d) => d.date), ["2026-10-26", "2026-11-01"]);
});

test("weekScore removes activity over the daily cap and adds the active-day bonus", () => {
  const days = [{ date: "a", count: 50 }, { date: "b", count: 20 }, { date: "c", count: 0 }];
  assert.deepEqual(weekScore({ privateWork: 70 }, days), { activeDays: 2, overCap: 30, points: 50 });
});

test("weekScore rewards consistency over a burst of the same size", () => {
  const steady = Array.from({ length: 5 }, (_, i) => ({ date: `${i}`, count: 10 }));
  const burst = [{ date: "0", count: 50 }];
  assert.ok(weekScore({ commits: 50 }, steady).points > weekScore({ commits: 50 }, burst).points);
});

test("weekScore never goes negative when the calendar exceeds the weekly totals", () => {
  assert.equal(weekScore({}, [{ date: "a", count: 100 }]).points, 5);
});

test("weekStart returns Monday UTC, including on a Sunday", () => {
  assert.equal(weekStart(new Date("2026-11-01T23:59:00Z")).toISOString(), "2026-10-26T00:00:00.000Z");
  assert.equal(weekStart(new Date("2026-10-26T00:00:00Z")).toISOString(), "2026-10-26T00:00:00.000Z");
});

test("weekRanges ends with the current week and has no gaps", () => {
  const ranges = weekRanges(new Date("2026-10-30T12:00:00Z"), 3);
  assert.equal(ranges.length, 3);
  assert.equal(ranges[0].start.toISOString(), "2026-10-12T00:00:00.000Z");
  assert.equal(ranges[2].end.toISOString(), "2026-11-01T23:59:59.000Z");
  assert.equal(ranges[1].end.getTime() + 1000, ranges[2].start.getTime());
});

test("points applies weights and tolerates missing fields", () => {
  assert.equal(points({ commits: 2, prsOpened: 1, reviews: 1 }), 9);
  assert.equal(points({}), 0);
});

test("strain is 0 at rest, rises, and never exceeds 21", () => {
  assert.equal(strain(0), 0);
  assert.ok(strain(60) > strain(30));
  assert.ok(strain(100000) <= 21);
});

test("currentStreak does not count today as a break", () => {
  const day = (date, count) => ({ date, count });
  const today = new Date("2026-10-30T12:00:00Z");
  assert.equal(currentStreak([day("2026-10-28", 1), day("2026-10-29", 2), day("2026-10-30", 0)], today), 2);
  assert.equal(currentStreak([day("2026-10-28", 1), day("2026-10-29", 0), day("2026-10-30", 3)], today), 1);
  assert.equal(currentStreak([day("2026-10-30", 0), day("2026-10-31", 5)], today), 0);
});

test("isValidLogin rejects anything that could alter a search query", () => {
  assert.ok(isValidLogin("nb110240"));
  assert.ok(isValidLogin("some-user"));
  assert.ok(!isValidLogin('x" is:private'));
  assert.ok(!isValidLogin("-leading"));
  assert.ok(!isValidLogin(""));
});
