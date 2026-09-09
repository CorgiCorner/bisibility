import type { AddKeywordDrawerForm } from "@/lib/keywords/add-keyword-drawer-shared";
import { describe, expect, it } from "vitest";
import { addKeywordDrawerInput } from "./AddKeywordDrawerSubmit";

const values = {
  city: null,
  device: "desktop" as const,
  isPaused: false,
  keywords: "rank tracker",
  location: "United States",
  projectId: "prj_1",
  schedule: undefined,
  tags: [],
  targetUrl: "",
} satisfies AddKeywordDrawerForm;

describe("addKeywordDrawerInput", () => {
  it("creates a country-language target matrix from selected registry keys", () => {
    expect(
      addKeywordDrawerInput({
        activeTab: "manual",
        csvText: "",
        devices: ["desktop", "mobile"],
        existingKeywords: [],
        locationKeys: ["ES", "ES@ca"],
        locationValue: {
          canonicalKey: "US",
          cityName: null,
          countryCode: "US",
          displayName: "United States",
          kind: "country",
          regionName: null,
        },
        values,
      }),
    ).toEqual({
      input: {
        devices: ["desktop", "mobile"],
        intent: undefined,
        keywords: ["rank tracker"],
        locations: [{ locationKey: "ES" }, { locationKey: "ES@ca" }],
        projectId: "prj_1",
        schedule: undefined,
        tags: [],
        targetUrl: "",
        topic: undefined,
      },
    });
  });

  it("submits a just-created market by its canonical key with the assigned schedule", () => {
    const scheduleId = `sch_${"a".repeat(24)}`;

    expect(
      addKeywordDrawerInput({
        activeTab: "manual",
        checkScheduleId: scheduleId,
        csvText: "",
        devices: ["desktop"],
        existingKeywords: [],
        locationKeys: ["US", "ES/Andalusia/Malaga"],
        locationValue: {
          canonicalKey: "US",
          cityName: null,
          countryCode: "US",
          displayName: "United States",
          kind: "country",
          regionName: null,
        },
        values,
      }),
    ).toMatchObject({
      input: {
        checkScheduleId: scheduleId,
        locations: [{ locationKey: "US" }, { locationKey: "ES/Andalusia/Malaga" }],
      },
    });
  });

  it.each(["manual", "csv"] as const)(
    "an explicit Manual selection overrides an old cadence in the %s form",
    (activeTab) => {
      const result = addKeywordDrawerInput({
        activeTab,
        checkScheduleId: null,
        csvText: "rank tracker",
        devices: ["desktop"],
        existingKeywords: [],
        locationKeys: ["US"],
        locationValue: {
          canonicalKey: "US",
          cityName: null,
          countryCode: "US",
          displayName: "United States",
          kind: "country",
          regionName: null,
        },
        values: {
          ...values,
          schedule: {
            frequency: "daily",
            cronExpression: null,
            jitterMinutes: 15,
            timezone: "Europe/Warsaw",
            serpDepth: 100,
          },
        },
      });
      expect(result).toMatchObject({
        input: { schedule: { frequency: "manual", timezone: "Europe/Warsaw", serpDepth: 100 } },
      });
      if ("input" in result) expect(result.input).not.toHaveProperty("checkScheduleId");
    },
  );

  it("rejects an old per-line target override instead of silently dropping markets", () => {
    expect(
      addKeywordDrawerInput({
        activeTab: "manual",
        csvText: "",
        devices: ["desktop"],
        existingKeywords: [],
        locationKeys: ["US"],
        locationValue: {
          canonicalKey: "US",
          cityName: null,
          countryCode: "US",
          displayName: "United States",
          kind: "country",
          regionName: null,
        },
        values: { ...values, keywords: "rank tracker | https://example.com/rank" },
      }),
    ).toEqual({ warning: "Per-line target URLs cannot be combined with multiple markets." });
  });
});
