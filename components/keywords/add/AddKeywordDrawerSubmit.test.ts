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
