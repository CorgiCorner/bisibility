import { localFixtureSelection } from "@/lib/dashboard-local/test-fixtures";
import { reportAsOf, reportKeyword, reportProject } from "@/lib/rank-reports/report-test-fixture";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  keywordExportSelectionSchema,
  rankTrackerExportQuerySchema,
} from "./keyword-export-contract";
import { rankTrackerAsOfFormSchema } from "./rank-tracker-as-of-input";
import {
  rankTrackerDetailHref,
  rankTrackerDetailReturnHref,
} from "./rank-tracker-detail-navigation";
import { rankTrackerNavigationHref, resetRankTrackerPage } from "./rank-tracker-navigation";
import { parseRankTrackerQuery, serializeRankTrackerQuery } from "./rank-tracker-query";
import { rankTrackerScope, resolveRankTrackerReportTime } from "./rank-tracker-report-scope";

afterEach(() => vi.useRealTimers());
describe("Rank Tracker explicit Local, period and snapshot query", () => {
  it("defaults to General without choosing an available subject", () => {
    expect(rankTrackerScope(parseRankTrackerQuery({}).state)).toEqual({
      view: "general",
      subject: null,
      comparisonDays: 7,
      asOf: null,
    });
  });
  it("roundtrips exact subject, UTC snapshot and period, preserving pagination and grouping", () => {
    const parsed = parseRankTrackerQuery({
      reportView: "local",
      localSubject: JSON.stringify(localFixtureSelection),
      comparisonDays: "28",
      asOf: reportAsOf.toISOString(),
      grouped: "1",
      page: "3",
    });
    expect(parsed.issues).toEqual([]);
    const again = parseRankTrackerQuery(Object.fromEntries(serializeRankTrackerQuery(parsed)));
    expect(again.state).toEqual(parsed.state);
    expect(resolveRankTrackerReportTime(rankTrackerScope(again.state), reportAsOf)).toEqual({
      asOf: reportAsOf,
      comparisonDays: 28,
    });
  });
  it.each([
    "",
    "not-json",
    "{}",
    "[]",
    JSON.stringify({ ...localFixtureSelection, assignmentRevision: 0 }),
    [JSON.stringify(localFixtureSelection)],
  ])("malformed subject stays invalid: %j", (localSubject) => {
    expect(parseRankTrackerQuery({ reportView: "local", localSubject }).issues).toContain(
      "localSubject",
    );
  });
  it.each(["8", "0x7", "Infinity", ["7", "28"]])(
    "refuses unsupported or ambiguous period %j",
    (comparisonDays) => {
      expect(parseRankTrackerQuery({ comparisonDays }).issues).toContain("comparisonDays");
    },
  );
  it.each([
    "2026-02-30T12:00:00.000Z",
    "2026-10-12T12:00:00+02:00",
    "2026-10-12T12:00:00Z",
    [reportAsOf.toISOString()],
  ])("refuses malformed or noncanonical snapshot %j", (asOf) => {
    expect(parseRankTrackerQuery({ asOf }).issues).toContain("asOf");
  });
  it("checks future timestamps and date rollover without accepting a fabricated calendar date", () => {
    vi.setSystemTime(reportAsOf);
    expect(rankTrackerAsOfFormSchema.safeParse({ date: "2026-02-30T12:00" }).success).toBe(false);
    expect(rankTrackerAsOfFormSchema.safeParse({ date: "2026-10-13T12:00" }).success).toBe(false);
    expect(rankTrackerAsOfFormSchema.safeParse({ date: "2026-10-12T12:00" }).success).toBe(true);
    expect(() =>
      resolveRankTrackerReportTime(
        { view: "general", subject: null, comparisonDays: 7, asOf: "2026-10-13T12:00:00.000Z" },
        reportAsOf,
      ),
    ).toThrow();
  });
  it("explicit clears and default values survive display navigation rather than reviving saved values", () => {
    const parsed = parseRankTrackerQuery({
      reportView: "general",
      localSubject: "null",
      comparisonDays: "7",
      asOf: "",
      page: "3",
    });
    const href = rankTrackerNavigationHref({
      basePath: "/owned",
      current: serializeRankTrackerQuery(parsed),
      query: resetRankTrackerPage(parsed.state),
      present: ["page"],
    });
    expect(Object.fromEntries(new URLSearchParams(href.split("?")[1]))).toMatchObject({
      reportView: "general",
      localSubject: "null",
      comparisonDays: "7",
      asOf: "",
      page: "1",
    });
  });
  it("detail/back transports all resolved defaults and never accepts an external return destination", () => {
    const query = parseRankTrackerQuery({
      reportView: "local",
      localSubject: JSON.stringify(localFixtureSelection),
      page: "3",
      q: "service",
      comparisonDays: "90",
      asOf: reportAsOf.toISOString(),
    }).state;
    const href = rankTrackerDetailHref(reportProject.publicId, reportKeyword, query);
    const listScope = new URL(href, "https://example.test").searchParams.get("listScope") ?? "";
    const returned = rankTrackerDetailReturnHref(reportProject.publicId, { listScope }, reportAsOf);
    expect(
      parseRankTrackerQuery(
        Object.fromEntries(new URL(returned, "https://example.test").searchParams),
      ).state,
    ).toEqual(query);
    const safe = rankTrackerDetailReturnHref(
      reportProject.publicId,
      { listScope: "https://evil.test/path?reportView=local" },
      reportAsOf,
    );
    expect(safe).not.toContain("evil.test");
    expect(
      rankTrackerDetailReturnHref(reportProject.publicId, { listScope: [listScope] }, reportAsOf),
    ).not.toContain("?");
    expect(
      rankTrackerDetailReturnHref(
        reportProject.publicId,
        { listScope: "reportView=invalid" },
        reportAsOf,
      ),
    ).not.toContain("?");
  });
  it("organic query export preserves General time while refusing Local reinterpretation", () => {
    const general = parseRankTrackerQuery({
      comparisonDays: "28",
      asOf: reportAsOf.toISOString(),
    }).state;
    expect(rankTrackerExportQuerySchema.parse(general).reportScope).toEqual(general.reportScope);
    expect(
      rankTrackerExportQuerySchema.safeParse({
        ...general,
        reportScope: {
          ...rankTrackerScope(general),
          view: "local",
          subject: localFixtureSelection,
        },
      }).success,
    ).toBe(false);
  });
});
