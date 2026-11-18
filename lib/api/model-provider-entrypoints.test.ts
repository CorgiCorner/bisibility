import {
  connectProvider,
  disconnectProvider,
  updateProviderCost,
  updateProviderRate,
} from "@/lib/actions/providers";
import { NATIVE_MODEL_PROVIDERS } from "@/lib/providers/model/types";
import { beforeEach, expect, it, vi } from "vitest";
import { updateProviderConnectionRateInTransaction } from "./provider-rate-service";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  audit: vi.fn(),
  db: {
    $transaction: vi.fn(),
    providerConnection: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    providerConnectionRate: { upsert: vi.fn() },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.db }));
vi.mock("./provider-verification", () => ({
  verifyProviderConnectionBeforeSave: mocks.verify,
  probeProviderConnection: mocks.verify,
}));
vi.mock("./provider-audit", () => ({
  auditConnection: (v: unknown) => v,
  auditProviderMutation: mocks.audit,
}));
vi.mock("@/lib/provider-allocations/initialize", () => ({ initializeConnectionBudgets: vi.fn() }));
vi.mock("@/lib/provider-allocations/project-lock", () => ({
  lockProjectForProviderMutation: vi.fn(),
}));
vi.mock("@/lib/metering/budget-mirror", () => ({ guardConnectionFundingMutation: vi.fn() }));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: () => ({}),
  encryptSecret: () => "fixture-encrypted",
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: vi.fn() }));
vi.mock("@/lib/analytics/server", () => ({
  readAnalyticsSurfaceFromHeaders: vi.fn(),
  readConsentFromCookies: vi.fn(),
  trackServerEvent: vi.fn(),
}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: async () => ({ id: "fixture-actor" }),
  requireProjectScope: async () => ({ id: "fixture-project" }),
  parseActionInput: (schema: { parse: (v: unknown) => unknown }, value: unknown) =>
    schema.parse(value),
  revalidateProviderViews: vi.fn(),
}));
vi.mock("./auth", () => ({
  ApiAuthError: class extends Error {},
  authenticateBearer: async () => ({
    kind: "project_key",
    creatorRole: "owner",
    apiKey: { id: "fixture-key", projectId: "fixture-project", scopes: ["read", "write"] },
    project: { id: "fixture-project", publicId: "prj_a00000000000000000000000" },
  }),
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: async () => ({ headers: new Headers(), success: true }),
  rateLimitExceeded: vi.fn(),
}));
const projectId = "prj_a00000000000000000000000";
const message = "Model providers do not support manual costs or legacy rates.";
beforeEach(() => {
  vi.clearAllMocks();
  const row = {
    id: "fixture-connection",
    publicId: "conn_a00000000000000000000000",
    kind: "model",
    provider: "openai",
    rates: [],
    credentialSource: "own",
    status: "connected",
    priority: 0,
    enabled: true,
  };
  mocks.db.$transaction.mockImplementation((run) => run(mocks.db));
  mocks.db.providerConnection.findUnique.mockResolvedValue(row);
  mocks.db.providerConnection.findMany.mockResolvedValue([]);
  mocks.db.providerConnection.upsert.mockResolvedValue(row);
  mocks.db.providerConnection.update.mockResolvedValue(row);
  mocks.verify.mockResolvedValue({ ok: true });
});
it.each(NATIVE_MODEL_PROVIDERS)(
  "%s rejects manual connect cost via action and REST",
  async (providerId) => {
    await expect(
      connectProvider({ projectId, providerId, secret: "fixture-key", costPerCheck: 0.25 }),
    ).rejects.toThrow(message);
    const path = ["projects", projectId, "providers", providerId, "connect"];
    const response = await handleApiRequest(
      new Request(`https://example.com/api/v1/${path.join("/")}`, {
        method: "POST",
        headers: { authorization: "Bearer fixture-key", "content-type": "application/json" },
        body: JSON.stringify({ credentials: { api_key: "fixture-key" }, cost_per_check: 0.25 }),
      }),
      path,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: 400, detail: message });
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.db.providerConnectionRate.upsert).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  },
);
it.each(NATIVE_MODEL_PROVIDERS)("%s rejects legacy cost and rate updates", async (providerId) => {
  await expect(updateProviderCost({ projectId, providerId, costPerCheck: 0.25 })).rejects.toThrow(
    message,
  );
  for (const feature of ["rank_check", "keyword_metrics"] as const) {
    await expect(
      updateProviderRate({ projectId, providerId, feature, costPerUnit: 0.25 }),
    ).rejects.toThrow(message);
    await expect(
      updateProviderConnectionRateInTransaction(
        mocks.db as never,
        { providerId, feature, amountCents: 25 },
        { projectId, actorId: null },
      ),
    ).rejects.toThrow(message);
  }
  expect(mocks.db.providerConnection.update).not.toHaveBeenCalled();
  expect(mocks.db.providerConnectionRate.upsert).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
});

it.each(NATIVE_MODEL_PROVIDERS)(
  "%s and legacy providers have no separate REST cost/rates routes",
  async (providerId) => {
    for (const suffix of ["cost", "rates"]) {
      for (const id of [providerId, "dataforseo"]) {
        const path = ["projects", projectId, "providers", id, suffix];
        const response = await handleApiRequest(
          new Request(`https://example.com/api/v1/${path.join("/")}`, {
            method: "PATCH",
            headers: { authorization: "Bearer fixture-key", "content-type": "application/json" },
            body: JSON.stringify({
              cost_per_check: 0.25,
              feature: "rank_check",
              cost_per_unit: 0.25,
            }),
          }),
          path,
        );
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({
          status: 404,
          type: "https://bisibility.com/problems/not_found",
          detail: "Route not found.",
        });
      }
    }
    expect(mocks.db.providerConnectionRate.upsert).not.toHaveBeenCalled();
  },
);

it.each(NATIVE_MODEL_PROVIDERS)(
  "%s disconnects an unregistered stored connection through action and REST",
  async (providerId) => {
    await expect(disconnectProvider({ projectId, providerId })).resolves.toEqual({ ok: true });
    const path = ["projects", projectId, "providers", providerId];
    const response = await handleApiRequest(
      new Request(`https://example.com/api/v1/${path.join("/")}`, {
        method: "DELETE",
        headers: { authorization: "Bearer fixture-key" },
      }),
      path,
    );
    expect(response.status).toBe(200);
    expect(mocks.db.providerConnection.delete).toHaveBeenCalledTimes(2);
    expect(mocks.verify).not.toHaveBeenCalled();
  },
);

it("accepts manual connect cost for a legacy provider on the same real route", async () => {
  const path = ["projects", projectId, "providers", "dataforseo", "connect"];
  const response = await handleApiRequest(
    new Request(`https://example.com/api/v1/${path.join("/")}`, {
      method: "POST",
      headers: { authorization: "Bearer fixture-key", "content-type": "application/json" },
      body: JSON.stringify({
        credentials: { login: "fixture", secret: "fixture-key" },
        cost_per_check: 0.25,
      }),
    }),
    path,
  );
  expect(response.status).toBe(201);
  expect(mocks.db.providerConnectionRate.upsert).toHaveBeenCalledOnce();
});

it.each(NATIVE_MODEL_PROVIDERS)(
  "%s accepts all documented lifecycle routes",
  async (providerId) => {
    const row = await mocks.db.providerConnection.findUnique();
    row.provider = providerId;
    const path = ["projects", projectId, "providers", providerId];
    for (const [method, suffix, body, status] of [
      ["POST", "connect", { credentials: { api_key: "fixture-key" } }, 201],
      ["POST", "test", { credentials: { api_key: "fixture-key" } }, 200],
      ["PATCH", "", { enabled: false, priority: 7, cost_per_check: 0.25 }, 200],
      ["DELETE", "", undefined, 200],
    ] as const) {
      const route = suffix ? [...path, suffix] : path;
      const response = await handleApiRequest(
        new Request(`https://example.com/api/v1/${route.join("/")}`, {
          method,
          headers: { authorization: "Bearer fixture-key", "content-type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        }),
        route,
      );
      if (suffix === "test") expect(await response.json()).toMatchObject({ ok: true });
      if (suffix === "connect" || method === "PATCH")
        expect(await response.json()).toMatchObject({ id: providerId, kind: "model" });
      expect(response.status).toBe(status);
    }
    expect(mocks.verify).toHaveBeenCalledTimes(2);
    expect(mocks.db.providerConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ enabled: false, priority: 7 }),
      }),
    );
    expect(mocks.db.providerConnectionRate.upsert).not.toHaveBeenCalled();
    const update = mocks.db.providerConnection.update.mock.calls[0][0].data;
    expect(update).not.toHaveProperty("costPerCheckCents");
  },
);

it.each(["dataforseo", "serpapi"])("%s PATCH ignores manual cost fields", async (providerId) => {
  const row = {
    ...(await mocks.db.providerConnection.findUnique()),
    kind: "serp",
    provider: providerId,
  };
  mocks.db.providerConnection.findUnique.mockResolvedValue(row);
  mocks.db.providerConnection.update.mockResolvedValue(row);
  const path = ["projects", projectId, "providers", providerId];
  const response = await handleApiRequest(
    new Request(`https://example.com/api/v1/${path.join("/")}`, {
      method: "PATCH",
      headers: { authorization: "Bearer fixture-key", "content-type": "application/json" },
      body: JSON.stringify({ enabled: false, priority: 7, cost_per_check: 0.25 }),
    }),
    path,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: providerId, kind: "serp" });
  expect(mocks.db.providerConnection.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { enabled: false, priority: 7 } }),
  );
  expect(mocks.db.providerConnectionRate.upsert).not.toHaveBeenCalled();
  expect(mocks.verify).not.toHaveBeenCalled();
});

it.each(["first", "second"])("starts the %s isolation control with fresh mock state", async () => {
  expect(mocks.verify).not.toHaveBeenCalled();
  expect(mocks.db.providerConnectionRate.upsert).not.toHaveBeenCalled();
  const row = await mocks.db.providerConnection.findUnique();
  expect(row.provider).toBe("openai");
  row.provider = "fixture-previous-case";
  mocks.verify("fixture-previous-case");
  mocks.db.providerConnectionRate.upsert("fixture-previous-case");
  expect(mocks.verify).toHaveBeenCalledOnce();
  expect(mocks.db.providerConnectionRate.upsert).toHaveBeenCalledOnce();
});
