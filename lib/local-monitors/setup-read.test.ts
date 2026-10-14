import { describe, expect, it, vi } from "vitest";
import { readMonitorSetupChoices } from "./setup-read";

const { access, location } = vi.hoisted(() => ({ access: vi.fn(), location: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/local-monitoring-store/access", () => ({ localProjectScope: access }));
vi.mock("@/lib/business-location-store/location-repository", () => ({
  loadBusinessLocation: location,
}));

describe("same-project saved center choices", () => {
  it("returns only saved address/coordinates behind project authorization, preserving zero and missing data", async () => {
    access.mockResolvedValue({
      project: { id: "owned-project", writeMode: "active" },
      grant: { role: "owner" },
    });
    location
      .mockResolvedValueOnce({
        location: {
          currentRevision: {
            id: "revision-a",
            snapshot: {
              name: "Example branch",
              address: "Example street 1",
              coordinates: { latitude: 0, longitude: 0 },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        location: { currentRevision: { id: "revision-b", snapshot: { name: "Unlocated branch" } } },
      });
    const subjects = vi.fn().mockResolvedValue([{ publicId: "biz_a" }, { publicId: "biz_b" }]);
    const tx = {
      businessLocation: { findMany: subjects },
      keyword: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const db = { $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) };
    const context = { actor: { kind: "test" } };
    const result = await readMonitorSetupChoices(
      { projectId: "prj_abcdefghijklmnopqrstuvwx" },
      context as never,
      db as never,
    );
    expect(subjects).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "owned-project",
          state: "active",
          role: "subject",
        }),
        take: 51,
      }),
    );
    expect(location).toHaveBeenNthCalledWith(1, tx, "owned-project", "biz_a");
    expect(result.subjects).toEqual([
      {
        id: "biz_a",
        name: "Example branch",
        identityRevisionId: "revision-a",
        address: "Example street 1",
        coordinates: { latitude: 0, longitude: 0 },
      },
      {
        id: "biz_b",
        name: "Unlocated branch",
        identityRevisionId: "revision-b",
        address: null,
        coordinates: null,
      },
    ]);
    access.mockRejectedValueOnce(new Error("Forbidden"));
    subjects.mockClear();
    await expect(
      readMonitorSetupChoices(
        { projectId: "prj_abcdefghijklmnopqrstuvwx" },
        context as never,
        db as never,
      ),
    ).rejects.toThrow("Forbidden");
    expect(subjects).not.toHaveBeenCalled();
  });
});
