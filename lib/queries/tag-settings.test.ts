import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSettingsTagRows, getSettingsTags, type SettingsTagRecord } from "./tag-settings";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    savedView: { findMany: vi.fn() },
    tag: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const rule = {
  autoJoin: true,
  excludePatterns: [] as string[],
  kind: "path_pattern",
  pattern: "/{slug}",
  sitemapUrl: null,
  tagTargetingKeywords: false,
  urls: [] as string[],
};

function tag(
  patch: Partial<SettingsTagRecord> & Pick<SettingsTagRecord, "name">,
): SettingsTagRecord {
  return {
    _count: { keywords: 0, pageLinks: 0 },
    alertTargets: [],
    pageRule: null,
    publicId: `tag_${patch.name}`,
    ...patch,
  };
}

describe("buildSettingsTagRows", () => {
  it("describes rules and collects alert, view, and segment usage once per tag", () => {
    const rows = buildSettingsTagRows(
      [
        tag({
          _count: { keywords: 2, pageLinks: 431 },
          alertTargets: [{ rule: { name: "Clicks drop" } }],
          name: "Tool pages",
          pageRule: rule,
        }),
        tag({
          _count: { keywords: 2, pageLinks: 0 },
          name: "Brand",
        }),
        tag({
          _count: { keywords: 0, pageLinks: 13 },
          name: "Comparisons",
          pageRule: {
            ...rule,
            kind: "sitemap",
            pattern: null,
            sitemapUrl: "https://example.com/sitemap.xml",
          },
        }),
        tag({
          _count: { keywords: 0, pageLinks: 20 },
          name: "FAQ",
          pageRule: { ...rule, kind: "url_list", pattern: null, urls: ["/a", "/b"] },
        }),
        tag({
          _count: { keywords: 0, pageLinks: 1 },
          name: "Home",
          pageRule: { ...rule, kind: "manual", pattern: null },
        }),
      ],
      [
        { config: { filters: { tags: ["Brand"] } }, name: "Brand terms", surface: "keywords" },
        { config: { filters: { tags: ["Tool pages"] } }, name: "Page focus", surface: "reports" },
      ],
    );

    expect(rows.map((row) => [row.name, row.ruleLabel, row.segmentCount])).toEqual([
      ["Tool pages", { kind: "pattern", pattern: "/{slug}" }, 1],
      ["Brand", { kind: "none" }, 1],
      ["Comparisons", { kind: "sitemap" }, 0],
      ["FAQ", { kind: "urls", count: 2 }, 0],
      ["Home", { kind: "hand" }, 0],
    ]);
    expect(rows[0]?.usage).toEqual([
      { kind: "alert", name: "Clicks drop" },
      { kind: "saved_view", name: "Page focus" },
    ]);
    expect(rows[1]?.usage).toEqual([{ kind: "keyword_segment", name: "Brand terms" }]);
  });
});

describe("getSettingsTags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads tags, saved views, and sitemap URLs without a query per tag", async () => {
    mocks.prisma.tag.findMany.mockResolvedValue([
      tag({ _count: { keywords: 1, pageLinks: 1 }, name: "Docs" }),
      tag({ name: "Brand" }),
    ]);
    mocks.prisma.savedView.findMany.mockResolvedValue([]);
    mocks.prisma.$queryRaw.mockResolvedValue([{ url: "https://example.com/sitemap.xml" }]);

    const model = await getSettingsTags("project_1");

    expect(mocks.prisma.tag.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.savedView.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(model.rows.map((row) => row.name)).toEqual(["Docs", "Brand"]);
    expect(model.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });
});
