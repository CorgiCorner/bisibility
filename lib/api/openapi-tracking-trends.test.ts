import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { beforeEach, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  authenticateBearer: vi.fn(),
  run: vi.fn(),
  samples: vi.fn(),
  scope: vi.fn(),
}));
vi.mock("./ai-tracking-service", () => ({
  trackingRun: service.run,
  trackingSamples: service.samples,
  trackingScope: service.scope,
}));
vi.mock("./router", async (importOriginal) =>
  (await import("./response-capture.test-support")).captureRouter(await importOriginal()),
);
vi.mock("./auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth")>()),
  authenticateBearer: service.authenticateBearer,
}));

import { trackingSnakeizeKeys } from "./ai-tracking-keys";
import { trackingTrends } from "./ai-tracking-trends";
import { aiTrackingComponentSchemas } from "./openapi-tracking-schemas";
import { handleApiRequest } from "./router";

// The REST response is `AiTrackingTrendsResponse`, `{ data: AiTrackingTrends }` with no other key.
const validate = new AjvJsonSchemaValidator().getValidator({
  additionalProperties: false,
  properties: { data: aiTrackingComponentSchemas.AiTrackingTrends },
  required: ["data"],
  type: "object",
} as never);
const currentId = `air_${"current".padEnd(24, "a")}`;
const previousId = `air_${"previous".padEnd(24, "a")}`;
const sample = {
  plan: { promptCategory: "neutral" },
  promptRevisionId: "revision",
  configurationHash: "configuration",
  measurement: "answer_present",
  evidence: { recordedSource: "fresh", effectiveLocale: "en-US", actualModel: "fixture" },
  observations: [{ competitorId: null, mentioned: true }],
};

beforeEach(() => {
  vi.resetAllMocks();
  service.run.mockImplementation(async (_projectId: string, runId: string) => ({
    publicId: runId,
    state: "completed",
    competitorSnapshot: [],
    samples: [sample],
  }));
  service.samples.mockResolvedValue({ items: [sample], nextCursor: null });
});

async function response(previousRunId?: string) {
  return {
    data: trackingSnakeizeKeys(await trackingTrends("project", currentId, previousRunId)),
  } as { data: Record<string, unknown> };
}

it("validates the serialized single-run response with its neutral baseline", async () => {
  const body = await response();
  expect(body.data).toMatchObject({ baseline: "neutral", comparable: false, delta: null });
  expect(validate(body)).toMatchObject({ valid: true });
});

it("validates actual comparisons and all four category strata", async () => {
  const body = await response(previousId);
  expect(body.data).toMatchObject({ baseline: "neutral", category: "neutral", comparable: true });
  expect(body.data.strata).toEqual(
    ["neutral", "comparative", "branded", "unknown"].map((category) =>
      expect.objectContaining({ category }),
    ),
  );
  expect(validate(body)).toMatchObject({ valid: true });
});

it("validates incomplete and configuration-incomparable evidence without inventing deltas", async () => {
  service.samples.mockResolvedValue({ items: [sample], nextCursor: "opaque-page" });
  const bounded = await response(previousId);
  expect(bounded.data).toMatchObject({
    comparable: false,
    delta: null,
    next_cursor: "opaque-page",
  });
  expect(validate(bounded)).toMatchObject({ valid: true });
  service.samples.mockImplementation(async (_projectId: string, runId: string) => ({
    items: [{ ...sample, configurationHash: runId }],
    nextCursor: null,
  }));
  const changed = await response(previousId);
  expect(changed.data).toMatchObject({
    comparable: false,
    delta: null,
    reason: "Configuration changed",
  });
  expect(validate(changed)).toMatchObject({ valid: true });
});

it("keeps trend metadata closed and rejects unsupported baselines and category evidence", async () => {
  const body = await response(previousId);
  expect(validate({ data: { ...body.data, invented: true } }).valid).toBe(false);
  expect(validate({ data: { ...body.data, baseline: "branded" } }).valid).toBe(false);
  const strata = body.data.strata as Record<string, unknown>[];
  expect(
    validate({ data: { ...body.data, strata: [{ ...strata[0], category: "invented" }] } }).valid,
  ).toBe(false);
  expect(
    validate({ data: { ...body.data, strata: [{ ...strata[0], current: { coverage: 2 } }] } })
      .valid,
  ).toBe(false);
});

it("serves the trend comparison through the API router", async () => {
  service.scope.mockResolvedValue({ id: "project", publicId: "prj_a00000000000000000000000" });
  service.authenticateBearer.mockResolvedValue({
    apiKey: {
      id: "key_1",
      name: "Key",
      prefix: "bsb_key_live_",
      projectId: "project",
      scopes: ["read"],
    },
    kind: "project_key",
    project: {
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      domain: "example.com",
      id: "project",
      name: "Example",
      publicId: "prj_a00000000000000000000000",
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    },
  });
  const path = ["projects", "prj_a00000000000000000000000", "ai-tracking", "trends"];

  const routed = await handleApiRequest(
    new Request(
      `https://example.com/api/v1/${path.join("/")}?run_id=${currentId}&previous_run_id=${previousId}`,
      { headers: { Authorization: "Bearer bsb_key_live_test" } },
    ),
    path,
  );

  expect(routed.status).toBe(200);
});
