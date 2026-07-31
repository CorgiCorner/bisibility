import { describe, expect, it } from "vitest";
import {
  importChunkChecksum,
  importSessionChunkSchema,
  importSessionCreateSchema,
} from "./session-schemas";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const keywordId = "kw_abcdefghijklmnopqrstuvwx";

function sectionsChunk(sections: Record<string, unknown>) {
  const payload = { kind: "sections", sections } as const;
  return { ...payload, checksum: importChunkChecksum(payload) };
}

describe("cloud import session v6 schemas", () => {
  it("requires an exact lowercase source project ID and native counts", () => {
    const manifest = {
      chunk_count: 2,
      source_project_id: projectId,
      totals: { keywords: 1, rank_checks: 2 },
      version: 6,
    };
    expect(importSessionCreateSchema.safeParse(manifest).success).toBe(true);
    expect(
      importSessionCreateSchema.safeParse({ ...manifest, source_project_id: undefined }).success,
    ).toBe(false);
    expect(
      importSessionCreateSchema.safeParse({
        ...manifest,
        source_project_id: ` ${projectId}`,
      }).success,
    ).toBe(false);
    expect(
      importSessionCreateSchema.safeParse({
        ...manifest,
        source_project_id: projectId.toUpperCase(),
      }).success,
    ).toBe(false);
    expect(importSessionCreateSchema.safeParse({ ...manifest, chunk_count: "2" }).success).toBe(
      false,
    );
    expect(
      importSessionCreateSchema.safeParse({
        ...manifest,
        totals: { keywords: "1", rank_checks: 2 },
      }).success,
    ).toBe(false);
  });

  it("requires the exact lowercase canonical checksum", () => {
    const keywords = [
      {
        device: "desktop",
        id: keywordId,
        keyword: "rank tracker",
        location: "United States",
        rankingHistory: [],
        tags: [],
      },
    ];
    const checksum = importChunkChecksum({ keywords, kind: "keywords" });
    const chunk = { checksum, keywords, kind: "keywords" };
    expect(importSessionChunkSchema.safeParse(chunk).success).toBe(true);
    expect(
      importSessionChunkSchema.safeParse({ ...chunk, checksum: checksum.toUpperCase() }).success,
    ).toBe(false);
    expect(importSessionChunkSchema.safeParse({ ...chunk, checksum: ` ${checksum}` }).success).toBe(
      false,
    );
  });

  it("accepts an in-flight v5 metadata-only chunk but not ambiguous v5 history", () => {
    const metadataOnlyKeywords = [
      {
        device: "desktop",
        id: keywordId,
        keyword: "rank tracker",
        location: "United States",
        rankingHistory: [],
        tags: [],
      },
    ];
    expect(
      importSessionChunkSchema.safeParse({
        checksum: "sha256:29db664fdc7bef39721ef57092917923199d39d28c417384e80f97c36b6a999a",
        keywords: metadataOnlyKeywords,
        kind: "keywords",
      }).success,
    ).toBe(true);

    const ambiguousHistoryKeywords = [
      {
        ...metadataOnlyKeywords[0],
        rankingHistory: [
          {
            checkedAt: "2026-01-01T00:00:00.000Z",
            position: 3,
            previousPosition: 4,
            rankingUrl: "https://example.com/page",
          },
        ],
      },
    ];
    expect(
      importSessionChunkSchema.safeParse({
        checksum: "sha256:28b5788e6554cd1972d437ea6c7617cf2d806ac54c5fe1e34524647ff6431eb7",
        keywords: ambiguousHistoryKeywords,
        kind: "keywords",
      }).success,
    ).toBe(false);
  });

  it.each([
    ["keywords", []],
    ["project_id", projectId],
    ["version", 4],
    ["unexpected", true],
  ])("rejects %s inside a sections chunk", (field, value) => {
    const chunk = sectionsChunk({ alert_rules: [], [field]: value });

    expect(importSessionChunkSchema.safeParse(chunk).success).toBe(false);
  });
});
