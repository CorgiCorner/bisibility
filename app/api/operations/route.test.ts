import { notFound } from "next/dist/client/components/not-found";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  readOperationSnapshot: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.resolveProjectAccess }));
vi.mock("@/lib/rank-check/runs/snapshot", () => ({
  readOperationSnapshot: mocks.readOperationSnapshot,
}));

describe("GET operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.resolveProjectAccess.mockResolvedValue({
      mode: "member",
      projectId: "project_1",
      publicId: "prj_1",
    });
    mocks.readOperationSnapshot.mockResolvedValue([
      {
        capabilities: { pause: true, resume: false, retry: false },
        id: "import_1",
        kind: "gsc_import",
        presentation: { action: "pause", supportingText: "Import is running.", title: "Importing" },
        property: "sc-domain:example.com",
        progress: { done: 2, total: 4 },
        state: "running",
      },
    ]);
  });

  it("rejects anonymous requests without reading project data", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await GET(new Request("https://example.com/api/operations?project=prj_1"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.resolveProjectAccess).not.toHaveBeenCalled();
  });

  it("returns the operation event payload shape without shared caching", async () => {
    const response = await GET(new Request("https://example.com/api/operations?project=prj_1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      operations: [
        {
          capabilities: { pause: true, resume: false, retry: false },
          id: "import_1",
          kind: "gsc_import",
          presentation: {
            action: "pause",
            supportingText: "Import is running.",
            title: "Importing",
          },
          property: "sc-domain:example.com",
          progress: { done: 2, total: 4 },
          state: "running",
        },
      ],
    });
    expect(mocks.resolveProjectAccess).toHaveBeenCalledWith("prj_1");
    expect(mocks.readOperationSnapshot).toHaveBeenCalledWith("project_1");
  });

  it("preserves the real framework not-found response for a foreign project", async () => {
    mocks.resolveProjectAccess.mockImplementation(() => notFound());

    await expect(
      GET(new Request("https://example.com/api/operations?project=prj_foreign")),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(mocks.readOperationSnapshot).not.toHaveBeenCalled();
  });

  it("returns a non-cacheable degraded response when the snapshot cannot be read", async () => {
    mocks.readOperationSnapshot.mockRejectedValue(new Error("snapshot unavailable"));

    const response = await GET(new Request("https://example.com/api/operations?project=prj_1"));

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
