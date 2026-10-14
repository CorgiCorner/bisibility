import { expect, it } from "vitest";
import { historyActionFields } from "./export-history-request";

it("keeps current/legacy exports in V1 even when hidden report draft choices remain", () => {
  const draft = {
    granularity: "weekly",
    historyVersion: "2",
    range: "all",
    stream: "attempts",
  } as const;
  expect(historyActionFields({ ...draft, scope: "current" })).toEqual({
    granularity: "weekly",
    historyVersion: 1,
    stream: "observations",
  });
  expect(historyActionFields({ ...draft, scope: "history", historyVersion: "1" })).toEqual({
    granularity: "weekly",
    historyVersion: 1,
    stream: "observations",
  });
  expect(historyActionFields({ ...draft, scope: "history" })).toEqual({
    granularity: "daily",
    historyVersion: 2,
    stream: "attempts",
  });
});
