import { keywordViewFixture } from "@/lib/saved-views/view-test-fixture";
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
vi.mock("@/lib/saved-views/service", () => ({ createSavedViewFor: mocks.createSavedView }));
vi.mock("@/lib/queries/saved-views", () => ({ listSavedViewsFor: mocks.listSavedViews }));

function context(method: string, body?: unknown) {
  const url = new URL(`https://example.test/api/v1/projects/${projectPublicId}/saved-views`);
  return {
    actor: { id: rawUserId, memberships: [{ projectId: "project_db_1", role: "member" }] },
    actorId: rawUserId,
    auth: { project: { id: "project_db_1", publicId: projectPublicId } },
    headers: new Headers(),
    instance: "urn:test",
    method,
    origin: {
      credentialId: "key_test",
      credentialKind: "project_key",
      source: "api",
      surface: "programmatic",
    },
    path: [],
    req: new Request(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      method,
    }),
    url,
  } as unknown as ApiContext;
}

const view = {
  canDelete: true,
  revision: 3,
  visibility: "project" as const,
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
    mocks.listSavedViews.mockResolvedValue([{ ...view, definition: view.config }]);
    mocks.createSavedView.mockResolvedValue({ ...view, definition: view.config });
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
    expect(listBody.data[0]).toMatchObject({ revision: 3, visibility: "project" });
  });
});

it("whitelists full shared definition without leaking owner IDs or mutation capabilities", async () => {
  const definition = keywordViewFixture();
  definition.presentation.columnOrder = ["rankingUrl"];
  definition.presentation.sizing = { rankingUrl: 240 };
  definition.presentation.visibility = { rankingUrl: false };
  mocks.listSavedViews.mockResolvedValue([
    {
      ...view,
      definition,
      ownerId: "private-owner",
      canEdit: true,
      projectId: "internal-project",
      requestId: "internal-request",
    },
  ]);
  const body = await (await listProjectSavedViews(context("GET"), projectPublicId)).json();
  expect(body.data[0]).toMatchObject({
    config: { version: 1 },
    definition: { version: 2, page_size: 100 },
    revision: 3,
    visibility: "project",
  });
  expect(body.data[0].definition.presentation).toMatchObject({
    column_order: ["rankingUrl"],
    sizing: { rankingUrl: 240 },
    visibility: { rankingUrl: false },
  });
  expect(JSON.stringify(body)).not.toMatch(
    /private-owner|internal-project|internal-request|owner_id|created_by_id|can_edit/,
  );
});

it("rejects another project before reading saved views", async () => {
  mocks.listSavedViews.mockClear();
  const response = await listProjectSavedViews(context("GET"), "prj_bbbbbbbbbbbbbbbbbbbbbbbb");
  expect(response.status).toBe(403);
  expect(mocks.listSavedViews).not.toHaveBeenCalled();
});

it("does not let project credentials request private or v2 writes through the legacy creation transport", async () => {
  mocks.createSavedView.mockClear();
  await expect(
    createProjectSavedView(
      context("POST", { config: view.config, name: view.name, visibility: "private" }),
      projectPublicId,
    ),
  ).rejects.toThrow();
  await expect(
    createProjectSavedView(
      context("POST", { config: keywordViewFixture(), name: view.name }),
      projectPublicId,
    ),
  ).rejects.toThrow();
  expect(mocks.createSavedView).not.toHaveBeenCalled();
});
