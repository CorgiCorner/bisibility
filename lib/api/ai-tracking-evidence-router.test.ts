import { samplePlan } from "@/lib/ai-tracking/execution/fixture";
import { normalizeTrackingResponse } from "@/lib/ai-tracking/providers/normalize";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), scope: vi.fn(), samples: vi.fn() }));
vi.mock("./router", async (original) =>
  (await import("./response-capture.test-support")).captureRouter(await original()),
);
vi.mock("./auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  authenticateBearer: mocks.auth,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(async () => ({ headers: new Headers(), success: true })),
}));
vi.mock("./ai-tracking-service", () => ({
  trackingScope: mocks.scope,
  trackingSamples: mocks.samples,
}));

import { handleApiRequest } from "./router";

const projectId = "prj_a00000000000000000000000";
const runId = "air_a00000000000000000000000";
const now = "2026-10-18T00:00:00.000Z";
const normalized = normalizeTrackingResponse(
  samplePlan(),
  {
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        result: [
          {
            items: [
              {
                type: "message",
                text: "Example answer",
                ProviderCase: { nestedKey: [1, true, null, { sourceUrl: "https://example.com" }] },
              },
            ],
          },
        ],
      },
    ],
  },
  now,
);

async function read(resource: string) {
  const path = ["projects", projectId, "ai-tracking", ...resource.split("?")[0].split("/")];
  const response = await handleApiRequest(
    new Request(`https://example.com/api/v1/projects/${projectId}/ai-tracking/${resource}`, {
      headers: { Authorization: "Bearer bsb_key_test_evidence" },
    }),
    path,
  );
  expect(response.status).toBe(200);
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    kind: "project_key",
    apiKey: {
      id: "key-db",
      projectId: "project-db",
      scopes: ["read"],
      name: "Test",
      prefix: "test",
    },
    project: {
      id: "project-db",
      publicId: projectId,
      name: "Example",
      domain: "example.com",
      createdAt: new Date(now),
      updatedAt: new Date(now),
    },
  });
  mocks.scope.mockResolvedValue({ id: "project-db", publicId: projectId });
});

describe("retained provider evidence through the API router", () => {
  it.each([
    { label: "provider JSON", raw: normalized.evidence.raw, truncated: false },
    { label: "unavailable raw", raw: null, truncated: false },
    { label: "provider text preview", raw: '{"status_code":20000,"result":[', truncated: true },
    { label: "storage preview", raw: { truncated: true, preview: '{"result":[' }, truncated: true },
  ])("preserves $label in samples and JSON exports", async ({ raw, truncated }) => {
    mocks.samples.mockResolvedValue({
      items: [
        {
          publicId: "asm_a00000000000000000000000",
          promptRevision: { publicId: "apr_a00000000000000000000000", text: "Example?" },
          plan: {},
          source: "model_api",
          engine: "chat_gpt",
          measurement: normalized.measurement,
          answerText: normalized.evidence.answerText,
          raw,
          evidence: { ...normalized.evidence, rawTruncated: truncated },
          receipt: null,
          citations: [],
        },
      ],
      nextCursor: null,
    });
    const samples = await read(`runs/${runId}/samples`);
    const exported = await read(`export?run_id=${runId}&format=json`);
    for (const sample of [samples.data[0], exported.data.items[0]]) {
      expect(sample.evidence.raw).toEqual(raw);
      expect(sample.evidence.raw_truncated).toBe(truncated);
    }
  });
});
