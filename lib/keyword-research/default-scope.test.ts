import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeywordResearchPageProject } from "./context";

const mocks = vi.hoisted(() => ({
  prisma: {
    keyword: { groupBy: vi.fn() },
    location: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import { keywordResearchDefaultScope } from "./default-scope";

function project(defaults: KeywordResearchPageProject["defaults"] = null) {
  return { defaults, id: "project_1" } as KeywordResearchPageProject;
}

describe("keyword research default scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.keyword.groupBy.mockResolvedValue([]);
    mocks.prisma.location.findMany.mockResolvedValue([]);
  });

  it("uses a configured country-language pair before reading keywords", async () => {
    await expect(
      keywordResearchDefaultScope(
        project({
          city: null,
          country: "Germany",
          device: "mobile",
          locationKey: "DE",
          locationRef: null,
        } as KeywordResearchPageProject["defaults"]),
      ),
    ).resolves.toMatchObject({
      countryCode: "DE",
      countryName: "Germany",
      languageCode: "de",
      languageLabel: "German",
    });
    expect(mocks.prisma.keyword.groupBy).not.toHaveBeenCalled();
    expect(mocks.prisma.location.findMany).not.toHaveBeenCalled();
  });

  it("derives the research scope from the most tracked location", async () => {
    mocks.prisma.keyword.groupBy.mockResolvedValue([
      { _count: { _all: 12 }, device: "desktop", locationId: "loc_es" },
      { _count: { _all: 4 }, device: "mobile", locationId: "loc_de" },
    ]);
    mocks.prisma.location.findMany.mockResolvedValue([
      {
        canonicalKey: "ES/AN/Malaga",
        cityName: "Malaga",
        countryCode: "ES",
        displayName: "Malaga, Spain",
        hl: "es",
        id: "loc_es",
        kind: "city",
        languageLabel: "Spanish",
      },
      {
        canonicalKey: "DE",
        cityName: null,
        countryCode: "DE",
        displayName: "Germany",
        hl: "de",
        id: "loc_de",
        kind: "country",
        languageLabel: "German",
      },
    ]);

    await expect(keywordResearchDefaultScope(project())).resolves.toMatchObject({
      countryCode: "ES",
      countryName: "Spain",
      languageCode: "es",
      languageLabel: "Spanish",
    });
  });
});
