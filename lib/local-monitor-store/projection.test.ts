import { describe, expect, it } from "vitest";
import { buildMonitorDefinition } from "./definition";
import {
  monitorCalendarFixture as calendar,
  monitorDefinitionFixture as input,
  monitorKeywordFixture as keyword,
} from "./fixture";
import { monitorReadiness } from "./projection";

const definition = buildMonitorDefinition(input, {
  entityId: "entity",
  keywords: [keyword],
  revisionId: "revision-1",
});
const baseline = {
  state: "active",
  revisionId: "revision-1",
  definition,
  sources: {
    subject: { state: "active", role: "subject", currentRevisionId: input.identityRevisionId },
    keywords: [keyword],
  },
  intent: { mode: "scheduled", definitionRevisionId: "revision-1", snapshot: calendar },
  currentCalendar: calendar,
};
describe("monitor readiness is not a provider dispatch permit", () => {
  it("recognizes a current frozen scheduled intent without mutating any source", () => {
    expect(monitorReadiness(baseline)).toEqual({
      configurationCurrent: true,
      scheduledIntentCurrent: true,
      reasons: [],
    });
    expect(baseline.intent.snapshot.measurementEpoch).toBe("0");
  });
  it.each(["measurementTargetEpoch", "measurementPolicyEpoch"] as const)(
    "does not rejoin A after keyword %s settings A -> B -> A",
    (epoch) => {
      expect(
        monitorReadiness({
          ...baseline,
          sources: { ...baseline.sources, keywords: [{ ...keyword, [epoch]: "2" }] },
        }).reasons,
      ).toEqual(["keyword_changed"]);
    },
  );
  it.each(["timezone", "serpDepth", "providerPolicy", "timeOfDay", "measurementEpoch"] as const)(
    "requires re-review when calendar %s changes",
    (field) => {
      const value =
        field === "serpDepth"
          ? 100
          : field === "providerPolicy"
            ? "other"
            : field === "measurementEpoch"
              ? "2"
              : "changed";
      expect(
        monitorReadiness({ ...baseline, currentCalendar: { ...calendar, [field]: value } }).reasons,
      ).toEqual(["calendar_changed"]);
    },
  );
  it("distinguishes missing/archived subject, changed definition and disabled/deleted schedule", () => {
    expect(
      monitorReadiness({ ...baseline, sources: { ...baseline.sources, subject: null } }).reasons,
    ).toEqual(["subject_changed"]);
    expect(monitorReadiness({ ...baseline, revisionId: "revision-2" }).reasons).toEqual([
      "definition_changed",
    ]);
    expect(monitorReadiness({ ...baseline, currentCalendar: null }).reasons).toEqual([
      "calendar_changed",
    ]);
    expect(monitorReadiness({ ...baseline, state: "archived" }).reasons).toEqual(["archived"]);
  });
  it.each(["manual", "paused"])("preserves %s as an explicit non-scheduled state", (mode) => {
    expect(
      monitorReadiness({
        ...baseline,
        intent: { ...baseline.intent, mode, snapshot: null },
        currentCalendar: null,
      }),
    ).toEqual({ configurationCurrent: true, scheduledIntentCurrent: false, reasons: [mode] });
  });
});
