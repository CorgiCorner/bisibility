import { normalizeProjectSavedView } from "@/lib/saved-views/model";
import { describe, expect, it, vi } from "vitest";
import { cloudImportBodySchema } from "./schemas";
import { importCloudImportSections } from "./section-orchestrator";
import { importSavedViews } from "./sections";

vi.mock("server-only", () => ({}));

const ids = {
  keyword: "kw_abcdefghijklmnopqrstuvwx",
  rule: "alr_abcdefghijklmnopqrstuvwx",
  view: "viw_abcdefghijklmnopqrstuvwx",
};

function version4Body() {
  return cloudImportBodySchema.parse({
    alert_rules: [
      {
        channels: ["email"],
        condition_type: "position_drop",
        drop_positions: 5,
        id: ids.rule,
        name: "Position drop",
        target_type: "keyword",
        targets: [
          {
            device: "desktop",
            keyword: "rank tracker",
            keyword_id: ids.keyword,
            location: "United States",
            type: "keyword",
          },
        ],
      },
    ],
    competitors: [
      {
        domain: "competitor.example.com",
        id: "cmp_abcdefghijklmnopqrstuvwx",
        label: "Competitor",
      },
    ],
    keywords: [
      {
        device: "desktop",
        id: ids.keyword,
        keyword: "rank tracker",
        location: "United States",
        tags: [],
      },
    ],
    notification_preferences: [{ check_email: true, report_email: false }],
    saved_views: [{ config: { search: "rank" }, id: ids.view, name: "Rank", surface: "keywords" }],
    version: 5,
  });
}

describe("saved view import", () => {
  it("parses every version 4 section without dropping complete rule or preference fields", () => {
    const parsed = version4Body();

    expect(parsed.__sections).toEqual({
      alertRules: true,
      competitors: true,
      notificationPreferences: true,
      savedViews: true,
    });
    expect(parsed.alertRules[0]).toMatchObject({
      conditionType: "position_drop",
      dropPositions: 5,
      severity: "warning",
      targets: [expect.objectContaining({ keywordId: ids.keyword })],
    });
    expect(parsed.notificationPreferences[0]).toMatchObject({
      checkEmail: true,
      checkInApp: false,
      reportEmail: false,
    });
  });

  it("reports every unchanged version 4 section as skipped on re-import", async () => {
    const body = version4Body();
    const preference = body.notificationPreferences[0];
    const client = {
      alertRule: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({
          channels: ["email"],
          enabled: true,
          id: "rule_1",
          targets: [{ keywordId: "keyword_1", tagId: null }],
        }),
        update: vi.fn(),
      },
      alertRuleTarget: { createMany: vi.fn(), deleteMany: vi.fn() },
      competitor: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ domain: "competitor.example.com", label: "Competitor" }]),
        upsert: vi.fn(),
      },
      notificationPreference: {
        findUnique: vi.fn().mockResolvedValue(preference),
        upsert: vi.fn(),
      },
      savedView: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({
          config: normalizeProjectSavedView({ search: "rank" }, "keywords")?.config,
          id: "view_1",
        }),
        update: vi.fn(),
      },
      tag: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const counts = await importCloudImportSections(
      {
        createdById: "user_1",
        id: "token_1",
        projectId: "project_1",
        projectPublicId: "prj_abcdefghijklmnopqrstuvwx",
        publicId: "ferry_abcdefghijklmnopqrstuvwx",
      },
      { id: "project_1", ownerId: "owner_1" } as never,
      body,
      { byKey: new Map(), bySource: new Map([[ids.keyword, "keyword_1"]]) },
      client as never,
    );

    expect(counts).toEqual({
      alert_rules: 0,
      alert_rules_skipped: 1,
      competitors: 0,
      competitors_skipped: 1,
      notification_preferences: 0,
      notification_preferences_skipped: 1,
      saved_views: 0,
      saved_views_skipped: 1,
    });
    expect(client.alertRule.update).not.toHaveBeenCalled();
    expect(client.competitor.upsert).not.toHaveBeenCalled();
    expect(client.notificationPreference.upsert).not.toHaveBeenCalled();
    expect(client.savedView.update).not.toHaveBeenCalled();
  });

  it("matches by project, surface, and name so surfaces cannot overwrite each other", async () => {
    const client = {
      savedView: {
        create: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    };
    const views = [
      {
        config: {
          filters: {},
          lens: { device: "all", locationId: null },
          search: "",
          surface: "keywords",
          version: 1,
        },
        name: "Q3",
        surface: "keywords",
      },
      {
        config: {
          filters: { excludedKeywordIds: [], position: "all", tag: null },
          scope: { device: "desktop", engine: "google", locationId: "location_us" },
        },
        name: "Q3",
        surface: "competitors",
      },
    ] as Parameters<typeof importSavedViews>[1];

    await expect(importSavedViews("project_1", views, client as never)).resolves.toEqual({
      imported: 2,
      skipped: 0,
    });
    expect(client.savedView.findFirst.mock.calls.map(([input]) => input.where)).toEqual([
      { name: "Q3", projectId: "project_1", surface: "keywords" },
      { name: "Q3", projectId: "project_1", surface: "competitors" },
    ]);
    expect(client.savedView.create).toHaveBeenCalledTimes(2);
  });

  it("skips semantically identical nested JSON when database key order differs", async () => {
    const existingConfig = {
      version: 1,
      surface: "competitors",
      scope: { locationId: "location_us", engine: "google", device: "desktop" },
      filters: { tag: null, position: "all", excludedKeywordIds: ["keyword_2", "keyword_1"] },
    };
    const client = {
      savedView: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ config: existingConfig, id: "view_1" }),
        update: vi.fn(),
      },
    };
    const views = [
      {
        config: {
          filters: { excludedKeywordIds: ["keyword_2", "keyword_1"], position: "all", tag: null },
          scope: { device: "desktop", engine: "google", locationId: "location_us" },
          surface: "competitors",
          version: 1,
        },
        name: "Migration comparison",
        surface: "competitors",
      },
    ] as Parameters<typeof importSavedViews>[1];

    await expect(importSavedViews("project_1", views, client as never)).resolves.toEqual({
      imported: 0,
      skipped: 1,
    });
    expect(client.savedView.update).not.toHaveBeenCalled();
  });

  it("updates a genuinely changed config with the same saved-view identity", async () => {
    const client = {
      savedView: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({
          config: {
            filters: { excludedKeywordIds: [], position: "top3", tag: null },
            scope: { device: "desktop", engine: "google", locationId: "location_us" },
            surface: "competitors",
            version: 1,
          },
          id: "view_1",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const views = [
      {
        config: {
          filters: { excludedKeywordIds: [], position: "top10", tag: null },
          scope: { device: "desktop", engine: "google", locationId: "location_us" },
          surface: "competitors",
          version: 1,
        },
        name: "Migration comparison",
        surface: "competitors",
      },
    ] as Parameters<typeof importSavedViews>[1];

    await expect(importSavedViews("project_1", views, client as never)).resolves.toEqual({
      imported: 1,
      skipped: 0,
    });
    expect(client.savedView.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "view_1" } }),
    );
  });

  it("skips an invalid competitor view without dropping compatible views", async () => {
    const client = {
      savedView: {
        create: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    };
    const views = [
      { config: { extra: true, search: "rank", version: 2 }, name: "Legacy" },
      { config: { surface: "competitors" }, name: "Broken", surface: "competitors" },
    ] as Parameters<typeof importSavedViews>[1];

    await expect(importSavedViews("project_1", views, client as never)).resolves.toEqual({
      imported: 1,
      skipped: 1,
    });
    expect(client.savedView.create).toHaveBeenCalledOnce();
  });

  it("accepts a restore package containing one incompatible saved view", () => {
    const parsed = cloudImportBodySchema.safeParse({
      keywords: [
        {
          device: "desktop",
          id: ids.keyword,
          keyword: "rank tracker",
          location: "United States",
          tags: [],
        },
      ],
      saved_views: [
        { config: { search: "rank", version: 2 }, id: ids.view, name: "Legacy" },
        {
          config: { surface: "competitors" },
          id: "viw_bbcdefghijklmnopqrstuvwx",
          name: "Broken",
          surface: "competitors",
        },
      ],
      version: 5,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.keywords).toHaveLength(1);
      expect(parsed.data.savedViews).toHaveLength(2);
    }
  });
});
