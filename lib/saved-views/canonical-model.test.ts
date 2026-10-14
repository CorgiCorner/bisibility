import { describe, expect, it } from "vitest";
import { createSavedViewV2Schema, mapCanonicalSavedViewRecord } from "./canonical-model";
import { legacyProjectViewScope, normalizeStoredViewConfig } from "./config-model";
import { createProjectSavedViewSchema, mapSavedViewRecord } from "./model";
import { keywordViewFixture, viewProjectId, viewPublicId } from "./view-test-fixture";

describe("versioned view storage and compatibility", () => {
  it("defaults a session v2 create to private and rejects client ownership or paging state", () => {
    const input = {
      config: keywordViewFixture(),
      name: "Service",
      projectId: viewProjectId,
      requestId: "request-123",
    };
    expect(createSavedViewV2Schema.parse(input).visibility).toBe("private");
    for (const injected of [
      { ownerId: "other" },
      { userId: "other" },
      { page: 3 },
      { selection: ["kw_other"] },
    ])
      expect(createSavedViewV2Schema.safeParse({ ...input, ...injected }).success).toBe(false);
    expect(
      createProjectSavedViewSchema.safeParse({
        config: legacyProjectViewScope(input.config),
        name: "Service",
        projectId: viewProjectId,
        visibility: "private",
      }).success,
    ).toBe(false);
  });

  it("keeps an actual v1 scope and projects a valid v2 scope without downgrading invalid versions", () => {
    const initial = keywordViewFixture();
    const v2 = {
      ...initial,
      presentation: {
        ...initial.presentation,
        columnOrder: ["keyword", "position"],
        sizing: { keyword: 300 },
        visibility: { volume: false },
      },
    };
    const v1 = legacyProjectViewScope(v2);
    expect(normalizeStoredViewConfig(v2, "keywords")).toEqual(v2);
    expect(normalizeStoredViewConfig(v1, "keywords")).toEqual(v1);
    expect(legacyProjectViewScope(v2)).toMatchObject({
      filters: v2.filters,
      lens: v2.lens,
      search: v2.search,
      version: 1,
    });
    expect(normalizeStoredViewConfig({ version: 2, search: "legacy" }, "keywords")).toBeNull();
    expect(normalizeStoredViewConfig({ ...v2, version: 99 }, "keywords")).toBeNull();
    expect(
      normalizeStoredViewConfig({ filters: { city: "Krakow" }, search: "legacy" }, "keywords"),
    ).toBeNull();
  });

  it("bounds columns, widths and payload while retaining the v1 competitor exclusion limit", () => {
    const config = keywordViewFixture();
    const input = { config, name: "View", projectId: viewProjectId, requestId: "request-123" };
    expect(
      createSavedViewV2Schema.safeParse({
        ...input,
        config: { ...config, presentation: { ...config.presentation, sizing: { keyword: 4097 } } },
      }).success,
    ).toBe(false);
    expect(
      createSavedViewV2Schema.safeParse({
        ...input,
        config: {
          ...config,
          presentation: {
            ...config.presentation,
            columnOrder: Array.from({ length: 101 }, (_, i) => `column_${i}`),
          },
        },
      }).success,
    ).toBe(false);
    const competitor = {
      filters: {
        excludedKeywordIds: Array.from({ length: 10000 }, (_, i) => `id_${i}`),
        position: "all",
        tag: null,
      },
      scope: { device: "mobile", engine: "google", locationId: "krakow" },
      surface: "competitors",
      version: 1,
    };
    expect(normalizeStoredViewConfig(competitor)).not.toBeNull();
    expect(
      normalizeStoredViewConfig({
        ...competitor,
        filters: {
          ...competitor.filters,
          excludedKeywordIds: [...competitor.filters.excludedKeywordIds, "extra"],
        },
      }),
    ).toBeNull();
  });

  it("never emits ownership IDs and prevents legacy mapping from exposing private resources", () => {
    const row = {
      config: keywordViewFixture(),
      createdAt: new Date("2026-10-12T00:00:00Z"),
      createdById: "creator",
      id: "internal",
      name: "Service",
      ownerId: "owner",
      publicId: viewPublicId,
      revision: 1,
      surface: "keywords",
      visibility: "private" as const,
    };
    const result = mapCanonicalSavedViewRecord(row, {
      canDelete: true,
      canEdit: true,
      projectId: viewProjectId,
    });
    expect(result).toMatchObject({
      id: viewPublicId,
      projectId: viewProjectId,
      revision: 1,
      visibility: "private",
    });
    expect(result).not.toHaveProperty("ownerId");
    expect(result).not.toHaveProperty("createdById");
    expect(mapSavedViewRecord(row, true)).toBeNull();
  });
});
