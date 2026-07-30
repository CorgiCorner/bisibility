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

describe("cloud import session v5 schemas", () => {
  it("requires an exact lowercase source project ID and native counts", () => {
    const manifest = {
      chunk_count: 2,
      source_project_id: projectId,
      totals: { keywords: 1, rank_checks: 2 },
      version: 5,
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
