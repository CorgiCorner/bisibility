import type { ApiContext } from "@/lib/api/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listProjectCompetitors } from "./competitors";

const mocks = vi.hoisted(() => ({ getCompetitorsApiView: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/queries/competitors", () => ({
  getCompetitorsApiView: mocks.getCompetitorsApiView,
}));
vi.mock("@/lib/actions/competitors", () => ({
  addManagedCompetitor: vi.fn(),
  removeManagedCompetitor: vi.fn(),
}));

function context(): ApiContext {
  const url = new URL("https://app.example.com/api/v1/projects/prj_1/competitors");
  return {
    auth: {
      apiKey: {
        id: "key_1",
        name: "Key",
        prefix: "bsb_key_live_",
        projectId: "project_1",
        scopes: ["read"],
      },
      project: {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        domain: "example.com",
        id: "project_1",
        name: "Example",
        publicId: "prj_1",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
    headers: new Headers(),
    instance: url.toString(),
    method: "GET",
    path: ["projects", "prj_1", "competitors"],
    req: new Request(url),
    url,
  };
}

describe("competitors API projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCompetitorsApiView.mockResolvedValue({
      managedCompetitors: [],
      markets: [
        {
          device: "desktop",
          engine: "google",
          location: "United States",
          observations: [
            {
              completed: true,
              id: "kw_1",
              keyword: "rank tracker",
              ranked: true,
              ranks: { "example.com": 1 },
              tags: [],
              volume: 1_000,
            },
          ],
          shares: [{ domain: "example.com", shareOfVoice: 100 }],
        },
      ],
      suggestions: [],
    });
  });

  it("keeps the internal SOV volume input out of the public response", async () => {
    const response = await listProjectCompetitors(context(), "prj_1");
    const body = await response.json();

    expect(body.meta.markets[0].observations[0]).toEqual({
      completed: true,
      id: "kw_1",
      keyword: "rank tracker",
      ranked: true,
      ranks: { "example.com": 1 },
      tags: [],
    });
    expect(body.meta.markets[0].shares[0].share_of_voice).toBe(100);
    expect(JSON.stringify(body)).not.toContain('"volume"');
  });
});
