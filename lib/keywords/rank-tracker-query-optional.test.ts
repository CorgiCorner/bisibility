import { describe, expect, it } from "vitest";
import {
  defaultRankTrackerQueryState,
  parseRankTrackerQuery,
  serializeRankTrackerQuery,
} from "./rank-tracker-query";

describe("optional Rank Tracker URL fields", () => {
  it("leaves an empty General URL ready rather than marking its absent defaults invalid", () => {
    const parsed = parseRankTrackerQuery({});
    expect(parsed.issues).toEqual([]);
    expect(parsed.present.size).toBe(0);
    expect(parsed.state).toEqual(defaultRankTrackerQueryState);
    expect(serializeRankTrackerQuery(parsed).toString()).toBe("");
  });

  it("does not treat orthogonal route parameters or undefined values as malformed filters", () => {
    const parsed = parseRankTrackerQuery({ action: "filter", tab: "tracked", grouped: undefined });
    expect(parsed.issues).toEqual([]);
    expect(parsed.present.size).toBe(0);
  });

  it("accepts a partial valid URL without errors for unrelated omitted fields", () => {
    const parsed = parseRankTrackerQuery({ page: "3", q: "service", device: "mobile" });
    expect(parsed.issues).toEqual([]);
    expect(parsed.state).toMatchObject({ page: 3, search: "service", lens: { device: "mobile" } });
    expect([...parsed.present]).toEqual(["device", "page", "search"]);
  });

  it.each([
    { key: "grouped", value: "sideways" },
    { key: "page", value: "-1" },
    { key: "pageSize", value: "26" },
    { key: "sort", value: "unregistered" },
    { key: "dir", value: "clockwise" },
    { key: "device", value: "tablet" },
    { key: "contains", value: "x".repeat(81) },
    { key: "location", value: "x".repeat(121) },
    { key: "view", value: "x".repeat(121) },
    { key: "q", value: "x".repeat(121) },
    { key: "change", value: "" },
    { key: "wrongUrl", value: "" },
    { key: "urlChanged", value: "" },
    { key: "volMin", value: "" },
    { key: "volMax", value: "Infinity" },
    { key: "lastCheck", value: "unregistered" },
  ])("keeps the present malformed $key value invalid", ({ key, value }) => {
    expect(parseRankTrackerQuery({ [key]: value }).issues).toEqual([key]);
  });

  it.each([
    "grouped",
    "page",
    "pageSize",
    "sort",
    "dir",
    "device",
    "q",
    "location",
    "contains",
    "view",
  ])("does not confuse a present empty scalar array %s with an omitted field", (key) =>
    expect(parseRankTrackerQuery({ [key]: [] }).issues).toEqual([key]),
  );

  it("retains explicit valid empty and false values as URL presence across serialization", () => {
    const parsed = parseRankTrackerQuery({
      view: "",
      q: "",
      location: "",
      tags: "",
      contains: "",
      serp: "",
      grouped: "0",
      wrongUrl: "0",
      urlChanged: "false",
    });
    expect(parsed.issues).toEqual([]);
    expect(parsed.state).toMatchObject({
      grouped: false,
      search: "",
      savedViewId: null,
      lens: { locationId: null },
      filters: { contains: "", tags: [], serp: [], wrongUrl: false, urlChanged: false },
    });
    const roundtrip = parseRankTrackerQuery(Object.fromEntries(serializeRankTrackerQuery(parsed)));
    expect(roundtrip.issues).toEqual([]);
    expect(roundtrip.state).toEqual(parsed.state);
    expect(roundtrip.present).toEqual(parsed.present);
  });
});
