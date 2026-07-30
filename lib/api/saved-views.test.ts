import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import { createProjectSavedView, listProjectSavedViews } from "./saved-views";

const projectPublicId = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";
const savedViewPublicId = "viw_aaaaaaaaaaaaaaaaaaaaaaaa";
const rawUserId = "user_db_1";

const mocks = vi.hoisted(() => ({
  createSavedView: vi.fn(),
  listSavedViews: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/saved-views", () => ({ createSavedView: mocks.createSavedView }));
vi.mock("@/lib/queries/saved-views", () => ({ listSavedViews: mocks.listSavedViews }));

function context(method: string, body?: unknown) {
  const url = new URL(`https://example.test/api/v1/projects/${projectPublicId}/saved-views`);
  return {
    auth: { project: { id: "project_db_1", publicId: projectPublicId } },
    headers: new Headers(),
    instance: "urn:test",
    method,
    path: [],
    req: new Request(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      method,
    }),
    url,
  } as unknown as ApiContext;
}

const view = {
  config: {
    filters: { change: "any", position: ["top10"], serp: [], tags: [], wrongUrl: false },
    lens: { device: "all", locationId: null },
    search: "",
    surface: "keywords" as const,
    version: 1 as const,
  },
  createdAt: "2026-07-27T10:00:00.000Z",
  createdById: rawUserId,
  id: savedViewPublicId,
  name: "Top 10",
  surface: "keywords" as const,
};

describe("saved view REST resources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listSavedViews.mockResolvedValue([view]);
    mocks.createSavedView.mockResolvedValue(view);
  });

  it("never serializes the raw saved-view creator from list or create responses", async () => {
    const list = await listProjectSavedViews(context("GET"), projectPublicId);
    const create = await createProjectSavedView(
      context("POST", { config: view.config, name: view.name }),
      projectPublicId,
    );

    const listBody = await list.json();
    const createBody = await create.json();

    expect(listBody).toMatchObject({
      data: [expect.objectContaining({ id: savedViewPublicId })],
    });
    expect(createBody).toMatchObject({ id: savedViewPublicId });
    expect(JSON.stringify(listBody)).not.toContain(rawUserId);
    expect(JSON.stringify(createBody)).not.toContain(rawUserId);
  });
});
