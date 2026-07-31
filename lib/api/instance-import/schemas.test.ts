import { describe, expect, it } from "vitest";
import { cloudImportPackageSchema } from "./schemas";

const ids = {
  competitor: "cmp_abcdefghijklmnopqrstuvwx",
  keyword: "kw_abcdefghijklmnopqrstuvwx",
  project: "prj_abcdefghijklmnopqrstuvwx",
  rule: "alr_abcdefghijklmnopqrstuvwx",
  view: "viw_abcdefghijklmnopqrstuvwx",
};

function packageV5() {
  return {
    alert_rules: [
      {
        id: ids.rule,
        name: "Top three",
        targets: [{ keyword_id: ids.keyword, type: "keyword" }],
      },
    ],
    competitors: [{ domain: "competitor.example.com", id: ids.competitor, label: null }],
    keywords: [
      { device: "desktop", id: ids.keyword, keyword: "rank tracker", location: "United States" },
    ],
    notification_preferences: [],
    project_id: ids.project,
    saved_views: [{ config: {}, id: ids.view, name: "All" }],
    version: 5,
  };
}

function packageV6() {
  return {
    ...packageV5(),
    keywords: [
      {
        device: "desktop",
        id: ids.keyword,
        keyword: "rank tracker",
        location: "United States",
        rankingHistory: [
          {
            checkedAt: "2026-07-27T10:00:00.000Z",
            normalizationVersion: "v1",
            position: 3,
            previousPosition: 4,
            provider: "dataforseo",
            rankingUrl: "https://example.com/rank-tracker",
            requestedDepth: 100,
          },
        ],
      },
    ],
    version: 6,
  };
}

describe("cloud import package versions", () => {
  it("accepts strict v6 history and metadata-only v5 packages", () => {
    const v6 = cloudImportPackageSchema.parse(packageV6());
    expect(v6.keywords[0]?.rankingHistory[0]).toMatchObject({
      normalizationVersion: "v1",
      provider: "dataforseo",
      requestedDepth: 100,
    });
    const parsed = cloudImportPackageSchema.parse(packageV5());
    expect(parsed.alertRules[0]?.severity).toBe("urgent");
    expect(cloudImportPackageSchema.safeParse({ ...packageV5(), version: 4 }).success).toBe(false);
    expect(
      cloudImportPackageSchema.safeParse({ ...packageV5(), project_id: "project_1" }).success,
    ).toBe(false);
    expect(
      cloudImportPackageSchema.safeParse({ ...packageV5(), projectId: ids.project }).success,
    ).toBe(false);
  });

  it("rejects v5 packages with ambiguous ranking history", () => {
    const input = packageV5();
    input.keywords[0] = {
      ...input.keywords[0],
      rankingHistory: [{ checkedAt: "2026-07-27T10:00:00.000Z", position: null }],
    } as never;

    const parsed = cloudImportPackageSchema.safeParse(input);

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("re-export");
    }
  });

  it("preserves an explicit alert severity", () => {
    const input = packageV6();
    input.alert_rules[0] = { ...input.alert_rules[0], severity: "warning" } as never;

    expect(cloudImportPackageSchema.parse(input).alertRules[0]?.severity).toBe("warning");
  });

  it.each([
    { field: "project whitespace", value: { project_id: ` ${ids.project}` } },
    { field: "project uppercase", value: { project_id: ids.project.toUpperCase() } },
    {
      field: "keyword whitespace",
      value: {
        keywords: [
          {
            device: "desktop",
            id: `${ids.keyword} `,
            keyword: "rank tracker",
            location: "United States",
          },
        ],
      },
    },
    {
      field: "competitor uppercase",
      value: {
        competitors: [
          { domain: "competitor.example.com", id: ids.competitor.toUpperCase(), label: null },
        ],
      },
    },
  ])("rejects non-exact public IDs: $field", ({ value }) => {
    expect(cloudImportPackageSchema.safeParse({ ...packageV5(), ...value }).success).toBe(false);
  });

  it("requires competitor source IDs and native JSON scalar types", () => {
    expect(
      cloudImportPackageSchema.safeParse({
        ...packageV5(),
        competitors: [{ domain: "competitor.example.com", label: null }],
      }).success,
    ).toBe(false);
    expect(
      cloudImportPackageSchema.safeParse({
        ...packageV5(),
        competitors: [
          { domain: "https://competitor.example.com", id: ids.competitor, label: null },
        ],
      }).success,
    ).toBe(false);
    expect(
      cloudImportPackageSchema.safeParse({
        ...packageV5(),
        alert_rules: [{ enabled: "false", id: ids.rule, name: "Top three" }],
      }).success,
    ).toBe(false);
    expect(
      cloudImportPackageSchema.safeParse({
        ...packageV5(),
        keywords: [
          {
            device: "desktop",
            id: ids.keyword,
            keyword: "rank tracker",
            location: "United States",
            rankingHistory: [{ checkedAt: "2026-07-27T10:00:00.000Z", position: "3" }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown outer fields", () => {
    expect(
      cloudImportPackageSchema.safeParse({ ...packageV5(), filename: "export.json" }).success,
    ).toBe(false);
  });
});
