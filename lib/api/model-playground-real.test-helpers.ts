import { launchHarness } from "@/lib/model-playground/launch.test-support";
import type { ModelColumnResult } from "@/lib/model-playground/types";
import { modelAccountDigest } from "@/lib/providers/model/account-scope";
import { ModelCatalogCache } from "@/lib/providers/model/catalog-cache";
import { afterEach, beforeEach, vi } from "vitest";
import { resetIdempotencyForTests } from "./idempotency";
import { handleMcpPreauthenticatedApiRequest } from "./router";
import { snakeizeKeys } from "./surface";

const seams = vi.hoisted(() => ({
  transaction: vi.fn(),
  project: vi.fn(),
  user: vi.fn(),
  provider: vi.fn(),
  decrypt: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: seams.transaction,
    project: { findUnique: seams.project, findFirst: seams.project },
    user: { findUnique: seams.user },
  },
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: () => {
    throw new Error("No session in REST");
  },
}));
vi.mock("@/lib/redis/redis", () => ({
  getRedisClient: async () => null,
  redisConfigured: () => false,
  resetRedisClientForTests: () => undefined,
}));
vi.mock("@/lib/observability/request-failure", () => ({ reportRequestFailure: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: async () => undefined }));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "fixture" }));
vi.mock("@/lib/providers/model/registry", () => ({ getModelProvider: seams.provider }));
vi.mock("@/lib/providers/model/server-registration", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: seams.decrypt,
  getPurposeSecretKeys: () => ["synthetic-fixture-key"],
}));
vi.mock("@/lib/providers/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/providers/rate-limit")>()),
  consumeProviderLimit: async () => ({ success: true }),
}));

export function realServiceHarness() {
  const h = launchHarness();
  const projectId = "prj_a00000000000000000000000";
  const project = {
    id: h.context.projectId,
    publicId: projectId,
    ownerId: h.context.principal,
    domain: "example.com",
    name: "Fixture",
    writeMode: "active",
  };
  const auth = {
    kind: "project_key" as const,
    creatorRole: "owner" as const,
    apiKey: { id: "fixture-key", projectId: project.id, scopes: ["read", "write"] },
    project,
  };
  beforeEach(() => {
    vi.useRealTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => new AbortController().signal);
    vi.stubGlobal("fetch", () => {
      throw new Error("No network in REST fixtures");
    });
    const cache = new ModelCatalogCache();
    const { get, set } = ModelCatalogCache.prototype;
    vi.spyOn(ModelCatalogCache.prototype, "get").mockImplementation((scope) =>
      get.call(cache, scope),
    );
    vi.spyOn(ModelCatalogCache.prototype, "set").mockImplementation((scope, snapshot) =>
      set.call(cache, scope, snapshot),
    );
    resetIdempotencyForTests();
    seams.transaction.mockImplementation(h.runtime.db.$transaction);
    seams.project.mockImplementation(async () => {
      const row = (
        await h.sql.query<{ ownerId: string; writeMode: string }>(
          'SELECT "ownerId","writeMode" FROM projects WHERE id=$1',
          [project.id],
        )
      ).rows[0];
      return row ? { ...project, ...row } : null;
    });
    seams.user.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const row = (
        await h.sql.query<{ id: string; deactivatedAt: Date | null }>(
          'SELECT id,"deactivatedAt" FROM users WHERE id=$1',
          [where.id],
        )
      ).rows[0];
      const memberships = (
        await h.sql.query<{ projectId: string; role: string }>(
          'SELECT "projectId",role FROM memberships WHERE "userId"=$1',
          [where.id],
        )
      ).rows;
      return row ? { ...row, memberships } : null;
    });
    seams.provider.mockResolvedValue({
      ...h.adapter,
      probe: async () => ({
        state: "catalog_available",
        catalog: {
          ...(
            await h.runtime.resolve(h.runtime.db, project.id, {
              providerId: h.input.columns[0].providerId,
              connectionId: h.input.columns[0].connectionId,
            })
          ).catalog,
          accountDigest: modelAccountDigest(h.input.columns[0].providerId, "synthetic-key"),
          fetchedAt: new Date(Date.now() - 1000).toISOString(),
          expiresAt: new Date(Date.now() + 240000).toISOString(),
        },
      }),
    });
    seams.decrypt.mockReturnValue({ apiKey: "synthetic-key" });
  });
  afterEach(() => {
    h.answer((answer) => answer);
    resetIdempotencyForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    for (const seam of Object.values(seams)) seam.mockReset();
  });
  async function request(
    method: string,
    tail: string,
    body?: unknown,
    key?: string,
    currentAuth: unknown = auth,
  ) {
    const url = new URL(
      `https://example.com/api/v1/projects/${projectId}/model-playground/${tail}`,
    );
    return handleMcpPreauthenticatedApiRequest(
      new Request(url, {
        method,
        headers: { "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(snakeizeKeys(body)) }),
      }),
      url.pathname.replace("/api/v1/", "").split("/"),
      { auth: currentAuth as never },
    );
  }
  const catalogPath = () =>
    `catalog?provider_id=${h.input.columns[0].providerId}&connection_id=${h.input.columns[0].connectionId}`;
  async function preview() {
    const response = await request("POST", "runs/preview", h.input);
    if (response.status !== 200) throw new Error(JSON.stringify(await response.json()));
    return (await response.json()).data.quote_id as string;
  }
  const body = (quoteId: string) => ({
    version: 1,
    quoteId,
    consent: "non_guaranteed_estimate_v1",
  });
  const count = async () =>
    Number(
      (
        await h.sql.query<{ count: number }>(
          "SELECT count(*) AS count FROM model_playground_payment_attempts",
        )
      ).rows[0].count,
    );
  return { ...h, project, projectId, auth, request, catalogPath, preview, body, count };
}

export { seams };

/** One unsupported receipt and one measured receipt beside a separate estimate. */
export function projectionAnswer(
  answer: ModelColumnResult,
  badId: string,
  quoteId: string,
): ModelColumnResult {
  const column = answer.column;
  const bad = column.columnId === badId;
  const unit: NonNullable<ModelColumnResult["paymentReceipt"]>["option"]["payableUnit"] = bad
    ? {
        kind: "provider_native",
        providerId: column.providerId,
        key: "units",
        singular: "unit",
        plural: "units",
      }
    : { kind: "currency", code: "USD" };
  const money = {
    value: bad ? null : "0.12",
    unit,
    certainty: bad ? ("unknown" as const) : ("measured" as const),
  };
  return {
    ...answer,
    providerCost: bad
      ? answer.providerCost
      : {
          amount: "0.10",
          currency: "USD",
          certainty: "estimated",
          basis: "rate_card",
          rateCardVersion: "synthetic",
        },
    paymentReceipt: {
      actionId: `synthetic:${column.columnId}`,
      quoteId,
      option: {
        id: column.payment.optionId,
        connectionId: column.connectionId,
        providerId: column.providerId,
        providerLabel: "Synthetic",
        fundingSource: "byok",
        payableUnit: unit,
      },
      state: bad ? "unknown" : "settled",
      charge: money,
      providerCost: money,
    },
  };
}
