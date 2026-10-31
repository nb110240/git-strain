import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHistory, currentStreak, daysInWeek, isValidLogin, longestStreak, points, seasonOf, strain, weekRanges, weekScore, weekStart } from "./scoring.mjs";

test("weeks follow the group's time zone, not UTC", () => {
  // Sunday evening in Los Angeles is already Monday in UTC.
  const sundayNight = new Date("2026-11-02T04:00:00Z");
  assert.equal(weekStart(sundayNight, "UTC"), "2026-11-02");
  assert.equal(weekStart(sundayNight, "America/Los_Angeles"), "2026-10-26");
  const [range] = weekRanges(sundayNight, 1, "America/Los_Angeles");
  assert.equal(range.start.toISOString(), "2026-10-26T07:00:00.000Z");
});

test("a week spanning a daylight-saving change has no gap or overlap", () => {
  // US clocks go back on Sunday 2026-11-01, so that week is 169 hours long.
  const ranges = weekRanges(new Date("2026-11-03T12:00:00Z"), 2, "America/Los_Angeles");
  assert.equal(ranges[0].start.toISOString(), "2026-10-26T07:00:00.000Z");
  assert.equal(ranges[0].end.toISOString(), "2026-11-02T07:59:59.000Z");
  assert.equal(ranges[1].start.toISOString(), "2026-11-02T08:00:00.000Z");
});

test("currentStreak uses today's date in the group's time zone", () => {
  const day = (date, count) => ({ date, count });
  const days = [day("2026-10-29", 1), day("2026-10-30", 1), day("2026-10-31", 0)];
  // 02:00 UTC on the 31st is still the 30th in Los Angeles, so nothing has been missed either way.
  assert.equal(currentStreak(days, new Date("2026-10-31T02:00:00Z"), "America/Los_Angeles"), 2);
});

test("longestStreak finds the best run, not the latest one", () => {
  const days = [["a", 1], ["b", 1], ["c", 1], ["d", 0], ["e", 1]].map(([date, count]) => ({ date, count }));
  assert.equal(longestStreak(days), 3);
  assert.equal(longestStreak([]), 0);
});

test("seasonOf maps dates to calendar quarters", () => {
  assert.equal(seasonOf("2026-03-31"), "Q1 2026");
  assert.equal(seasonOf("2026-10-26"), "Q4 2026");
});

test("buildHistory awards wins, shares ties, and ignores the unfinished week", () => {
  const person = (login, points) => ({
    login,
    longestStreak: 4,
    weeks: points.map((p, i) => ({ start: ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"][i], points: p, strain: p / 10 })),
  });
  const { trophies, seasons } = buildHistory([person("a", [50, 30, 0, 999]), person("b", [10, 30, 0, 0])]);
  const [a, b] = trophies;
  assert.equal(a.weeklyWins, 2); // Sep 28 and the Oct 5 tie; Oct 12 is all zeros and Oct 19 is unfinished.
  assert.equal(b.weeklyWins, 1);
  assert.equal(a.seasonWins, 1); // Only the Q4 tie.
  assert.deepEqual(a.bestWeek, { start: "2026-10-19", strain: 99.9 });
  assert.equal(seasons[0].season, "Q4 2026");
  assert.equal(seasons[0].current, true);
  assert.deepEqual(seasons[0].champions, ["a"]);
  assert.equal(seasons[1].season, "Q3 2026");
  assert.equal(seasons[1].partial, true);
});

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
  assert.equal(weekStart(new Date("2026-11-01T23:59:00Z")), "2026-10-26");
  assert.equal(weekStart(new Date("2026-10-26T00:00:00Z")), "2026-10-26");
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
