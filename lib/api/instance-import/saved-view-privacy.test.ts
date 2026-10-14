import { emptySavedViewConfig } from "@/lib/keywords/saved-view-model";
import { keywordSavedViewConfigV2 } from "@/lib/keywords/saved-view-v2-model";
import { SavedViewConflictError } from "@/lib/saved-views/errors";
import { emptyTablePresentation } from "@/lib/saved-views/presentation-model";
import { describe, expect, it, vi } from "vitest";
import { importSavedViews } from "./sections";

vi.mock("server-only", () => ({}));

const config = keywordSavedViewConfigV2({
  ...emptySavedViewConfig,
  grouped: true,
  pageSize: 100,
  presentation: {
    ...emptyTablePresentation,
    columnOrder: ["keyword", "volume"],
    visibility: { volume: false },
  },
  sort: { direction: "desc", field: "position" },
});
const input = [
  {
    id: "viw_abcdefghijklmnopqrstuvwx",
    name: "Personal and project names can coincide",
    config,
    surface: "keywords" as const,
  },
];

describe("project restore view privacy", () => {
  it("keeps a complete v2 and never matches a same-name private resource", async () => {
    const privateRow = { id: "private", config: {}, revision: 8, visibility: "private" };
    const db = {
      savedView: {
        findFirst: vi.fn(async ({ where }) => (where.visibility === "project" ? null : privateRow)),
        create: vi.fn(async () => ({})),
        updateMany: vi.fn(),
      },
    };
    await expect(importSavedViews("project_1", input, db as never)).resolves.toEqual({
      imported: 1,
      skipped: 0,
    });
    expect(db.savedView.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          name: input[0].name,
          projectId: "project_1",
          surface: "keywords",
          visibility: "project",
        },
      }),
    );
    expect(db.savedView.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ config, visibility: "project", ownerId: null }),
      }),
    );
    expect(db.savedView.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a stale shared revision without overwriting newer configuration", async () => {
    const db = {
      savedView: {
        findFirst: vi.fn(async () => ({ id: "shared", config: emptySavedViewConfig, revision: 4 })),
        updateMany: vi.fn(async () => ({ count: 0 })),
        create: vi.fn(),
      },
    };
    await expect(importSavedViews("project_1", input, db as never)).rejects.toBeInstanceOf(
      SavedViewConflictError,
    );
    expect(db.savedView.updateMany).toHaveBeenCalledWith({
      data: { config, revision: { increment: 1 } },
      where: { id: "shared", projectId: "project_1", visibility: "project", revision: 4 },
    });
    expect(db.savedView.create).not.toHaveBeenCalled();
  });

  it("does not restore future configuration as a wider v1 view", async () => {
    const db = { savedView: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() } };
    await expect(
      importSavedViews(
        "project_1",
        [{ ...input[0], config: { ...config, version: 3 } }],
        db as never,
      ),
    ).resolves.toEqual({ imported: 0, skipped: 1 });
    expect(db.savedView.findFirst).not.toHaveBeenCalled();
  });
});
