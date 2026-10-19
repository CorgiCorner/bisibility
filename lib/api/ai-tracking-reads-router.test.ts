import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateBearer: vi.fn(),
  catalog: vi.fn(),
  listTopics: vi.fn(),
  runs: vi.fn(),
  scope: vi.fn(),
}));
vi.mock("./ai-tracking-service", () => ({
  trackingCatalog: mocks.catalog,
  trackingRuns: mocks.runs,
  trackingScope: mocks.scope,
}));
vi.mock("@/lib/ai-tracking/stores/topics", () => ({ listTopics: mocks.listTopics }));
vi.mock("./router", async (importOriginal) =>
  (await import("./response-capture.test-support")).captureRouter(await importOriginal()),
);
vi.mock("./auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth")>()),
  authenticateBearer: mocks.authenticateBearer,
}));

import { handleApiRequest } from "./router";

const projectPublicId = "prj_a00000000000000000000000";
const createdAt = new Date("2026-09-01T08:00:00.000Z");
const updatedAt = new Date("2026-09-02T08:00:00.000Z");
const topic = {
  archivedAt: null,
  createdAt,
  description: null,
  id: "topic_1",
  name: "Rank tracking",
  pausedAt: null,
  projectId: "project_1",
  publicId: "ait_a00000000000000000000000",
  updatedAt,
};

function prompt(index: number, topicId: string | null) {
  return {
    archivedAt: null,
    createdAt,
    id: `prompt_${index}`,
    label: index === 1 ? "Best rank tracker" : null,
    pausedAt: null,
    projectId: "project_1",
    publicId: `aip_${"a".repeat(22)}0${index}`,
    revisions: [
      {
        category: "neutral",
        createdAt,
        id: `revision_${index}`,
        ordinal: 1,
        promptId: `prompt_${index}`,
        provenance: null,
        publicId: `apr_${"a".repeat(22)}0${index}`,
        text: "Which rank tracker do agencies use for daily checks?",
        textHash: "a".repeat(64),
      },
    ],
    topicId,
    updatedAt,
  };
}

function run(index: number, state: string, finishedAt: Date | null) {
  return {
    _count: { samples: 3 },
    createdAt,
    finishedAt,
    id: `run_${index}`,
    plannedAt: createdAt,
    publicId: `air_${"a".repeat(22)}0${index}`,
    state,
    updatedAt,
  };
}

async function get(resource: string, query = "") {
  const path = ["projects", projectPublicId, "ai-tracking", resource];
  const response = await handleApiRequest(
    new Request(`https://example.com/api/v1/${path.join("/")}${query}`, {
      headers: { Authorization: "Bearer bsb_key_live_test" },
    }),
    path,
  );
  return { body: await response.json(), status: response.status };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticateBearer.mockResolvedValue({
    apiKey: {
      id: "key_1",
      name: "Key",
      prefix: "bsb_key_live_",
      projectId: "project_1",
      scopes: ["read"],
    },
    kind: "project_key",
    project: {
      createdAt,
      domain: "example.com",
      id: "project_1",
      name: "Example",
      publicId: projectPublicId,
      updatedAt,
    },
  });
  mocks.scope.mockResolvedValue({ id: "project_1", publicId: projectPublicId });
  mocks.listTopics.mockResolvedValue([topic]);
  mocks.catalog.mockResolvedValue([prompt(1, topic.id), prompt(2, null)]);
  mocks.runs.mockResolvedValue({
    items: [run(1, "completed", updatedAt), run(2, "running", null)],
    nextCursor: null,
  });
});

describe("AI tracking reads through the API router", () => {
  it("lists prompts with their topic and revisions, one page at a time", async () => {
    const first = await get("prompts", "?limit=1");

    expect(first.status).toBe(200);
    expect(first.body.data).toEqual([
      expect.objectContaining({
        id: prompt(1, null).publicId,
        revisions: [expect.objectContaining({ category: "neutral", ordinal: 1 })],
        topic_id: topic.publicId,
      }),
    ]);
    expect(first.body.meta.next_cursor).toEqual(expect.any(String));

    const second = await get("prompts", `?limit=1&cursor=${first.body.meta.next_cursor}`);
    expect(second.body.data).toEqual([
      expect.objectContaining({ id: prompt(2, null).publicId, topic_id: null }),
    ]);
    expect(second.body.meta.next_cursor).toBeNull();
    expect(mocks.catalog).toHaveBeenCalledWith("project_1", "prompts");
  });

  it("rejects a prompt page size above the tracking maximum", async () => {
    expect((await get("prompts", "?limit=101")).status).toBe(422);
  });

  it("reads the run history page", async () => {
    const history = await get("history", "?limit=2");

    expect(history.status).toBe(200);
    expect(history.body).toEqual({
      data: [
        expect.objectContaining({ sample_count: 3, state: "completed" }),
        expect.objectContaining({ finished_at: null, state: "running" }),
      ],
      meta: { next_cursor: null },
    });
    expect(mocks.runs).toHaveBeenCalledWith("project_1", { limit: "2" });
  });
});
