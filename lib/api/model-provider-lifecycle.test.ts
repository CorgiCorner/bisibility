import { createHash } from "node:crypto";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { registerModelProvider } from "@/lib/providers/model/registry";
import {
  type ModelProvider,
  type ModelProviderContext,
  NATIVE_MODEL_PROVIDERS,
  type NativeModelProviderId,
} from "@/lib/providers/model/types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { connectedProviderChainSettings, renumberProviderChain } from "./provider-chain-writer";
import { listProviderCategories } from "./provider-list";
import { connectProviderConnection, disconnectProviderConnection } from "./provider-service";
import { testProviderConnection } from "./provider-test-service";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  budgets: vi.fn(),
  wake: vi.fn(),
  limit: vi.fn(),
  db: {
    $transaction: vi.fn(),
    providerConnection: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/provider-allocations/initialize", () => ({
  initializeConnectionBudgets: mocks.budgets,
}));
vi.mock("@/lib/provider-allocations/project-lock", () => ({
  lockProjectForProviderMutation: vi.fn(),
  hasAcceptedConnectionRun: vi.fn(),
}));
vi.mock("@/lib/metering/budget-mirror", () => ({ guardConnectionFundingMutation: vi.fn() }));
vi.mock("@/lib/providers/rate-limit", () => ({ consumeProviderLimit: mocks.limit }));
vi.mock("@/lib/worker-intents/realtime", () => ({ publishWorkerIntent: mocks.wake }));

const context = {
  actorId: "fixture-actor",
  projectId: "fixture-project",
  projectPublicId: "prj_a00000000000000000000000",
};
const canary = "fixture-model-canary-do-not-disclose";
type Row = {
  id: string;
  publicId: string;
  projectId: string;
  provider: string;
  kind: "model";
  credentialsEncrypted: string | null;
  credentialSource: "own";
  enabled: boolean;
  priority: number;
  status: "connected" | "needs_reauth";
  updatedAt: Date;
  lastUsedAt: null;
  rates: [];
};
const rows = new Map<string, Row>();
const cleanups: (() => void)[] = [];
const probe = vi.fn<ModelProvider["probe"]>();
const generate = vi.fn<ModelProvider["generate"]>();
const key = (projectId: string, provider: string) => JSON.stringify([projectId, provider]);
const input = (providerId: NativeModelProviderId, apiKey = canary) => ({
  projectId: context.projectPublicId,
  providerId,
  credentials: { apiKey },
  enabled: true,
});

function catalog(id: NativeModelProviderId, ctx: ModelProviderContext) {
  return {
    version: 1 as const,
    providerId: id,
    accountDigest: ctx.accountDigest,
    fetchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    capabilityVersion: "fixture-v1",
    models: [
      {
        providerId: id,
        modelId: "fixture-model",
        sourceKind: "raw_model" as const,
        protocol:
          id === "openai"
            ? ("responses" as const)
            : id === "anthropic"
              ? ("messages" as const)
              : ("chat_completions" as const),
        capabilityVersion: "fixture-v1",
        availability: "fixture_verified" as const,
        text: {
          documentationUrl: "https://example.com/models",
          reviewedAt: new Date().toISOString(),
          fixtureRevision: "fixture-v1",
        },
        maxOutputTokens: 4096,
        temperature: false,
        search: [],
      },
    ],
  };
}
function register(id: NativeModelProviderId) {
  const load = vi.fn(async (): Promise<ModelProvider> => ({ id, probe, generate }));
  cleanups.push(registerModelProvider(id, load));
  probe.mockImplementation(async (ctx) => ({
    state: "catalog_available",
    catalog: catalog(id, ctx),
  }));
  return load;
}
beforeEach(() => {
  vi.clearAllMocks();
  rows.clear();
  vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network");
    }),
  );
  mocks.limit.mockResolvedValue({ success: true });
  mocks.db.$transaction.mockImplementation((run) => run(mocks.db));
  mocks.db.providerConnection.findUnique.mockImplementation(async ({ where }) => {
    const ref = where.projectId_provider;
    return ref
      ? (rows.get(key(ref.projectId, ref.provider)) ?? null)
      : ([...rows.values()].find((row) => row.id === where.id) ?? null);
  });
  mocks.db.providerConnection.findMany.mockImplementation(async ({ where }) =>
    [...rows.values()].filter(
      (row) => row.projectId === where.projectId && (!where.kind || row.kind === where.kind),
    ),
  );
  mocks.db.providerConnection.upsert.mockImplementation(async ({ create, update, where }) => {
    const ref = where.projectId_provider;
    const k = key(ref.projectId, ref.provider);
    const row = rows.get(k);
    const saved = {
      id: "fixture-connection",
      updatedAt: new Date(),
      lastUsedAt: null,
      rates: [],
      ...(row ? { ...row, ...update } : create),
    };
    rows.set(k, saved);
    return saved;
  });
  mocks.db.providerConnection.updateMany.mockImplementation(async ({ where, data }) => {
    const row = [...rows.values()].find(
      (row) => row.id === where.id && row.status === where.status,
    );
    if (!row) return { count: 0 };
    Object.assign(row, data);
    return { count: 1 };
  });
  mocks.db.providerConnection.delete.mockImplementation(async ({ where }) => {
    for (const [k, row] of rows) if (row.id === where.id) rows.delete(k);
  });
});
afterEach(() => {
  try {
    expect(generate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    for (const cleanup of cleanups.splice(0)) cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

it.each(NATIVE_MODEL_PROVIDERS)(
  "%s Connect/Test is unavailable without saving a key",
  async (id) => {
    registerModelProvider(id, vi.fn())();
    await expect(connectProviderConnection(input(id), context)).rejects.toThrow(
      "Model provider is not available yet.",
    );
    expect(await testProviderConnection(input(id), context)).toEqual({
      ok: false,
      message: "Model provider is not available yet.",
    });
    expect(rows.size).toBe(0);
    expect(mocks.db.providerConnection.upsert).not.toHaveBeenCalled();
    expect(mocks.budgets).not.toHaveBeenCalled();
  },
);

it.each(NATIVE_MODEL_PROVIDERS)(
  "%s invalid key is never stored and cannot overwrite a working key",
  async (id) => {
    const load = register(id);
    probe.mockResolvedValueOnce({ state: "invalid_key", catalog: null });
    await expect(connectProviderConnection(input(id), context)).rejects.toThrow(
      "Model credentials were rejected.",
    );
    expect(rows.size).toBe(0);
    expect(mocks.budgets).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledOnce();
    const working = await connectProviderConnection(input(id, "fixture-working-key"), context);
    const ciphertext = working.credentialsEncrypted;
    probe.mockResolvedValue({ state: "invalid_key", catalog: null });
    await expect(connectProviderConnection(input(id), context)).rejects.toThrow(
      "Model credentials were rejected.",
    );
    expect(await testProviderConnection(input(id), context)).toEqual({
      ok: false,
      message: "Model credentials were rejected.",
    });
    expect(rows.get(key(context.projectId, id))?.credentialsEncrypted).toBe(ciphertext);
    expect(decryptProviderCredentials(ciphertext)).toEqual({ apiKey: "fixture-working-key" });
    expect(mocks.db.providerConnection.upsert).toHaveBeenCalledOnce();
  },
);

it.each(NATIVE_MODEL_PROVIDERS)(
  "%s uses only a free lazy probe and upserts one masked project connection",
  async (id) => {
    const load = register(id);
    expect(load).not.toHaveBeenCalled();
    expect(
      (await listProviderCategories(context.projectId)).find((category) => category.id === "model")
        ?.providers,
    ).toHaveLength(4);
    expect(load).not.toHaveBeenCalled();
    const first = await connectProviderConnection(input(id), context);
    await connectProviderConnection(input(id, "fixture-rotated-key"), context);
    expect(rows.size).toBe(1);
    expect(rows.get(key(context.projectId, id))?.id).toBe(first.id);
    expect(first.credentialsEncrypted).not.toContain(canary);
    expect(decryptProviderCredentials(first.credentialsEncrypted)).toEqual({ apiKey: canary });
    expect(probe.mock.calls[0][0]).toMatchObject({
      apiKey: canary,
      accountDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      signal: expect.any(AbortSignal),
    });
    expect(probe.mock.calls[0][0].accountDigest).not.toBe(
      createHash("sha256").update(context.projectId).digest("hex"),
    );
    const categories = await listProviderCategories(context.projectId);
    const model = categories
      .find((category) => category.id === "model")
      ?.providers.find((provider) => provider.id === id);
    expect(model).toMatchObject({
      kind: "model",
      connected: true,
      connectionStatus: "connected",
      capabilities: { rankChecks: false, searchPerformance: false },
    });
    expect(model?.primary).toBeUndefined();
    expect(model?.meta).toContainEqual({ label: "Billing", value: "Billed by your provider" });
    const serialized = JSON.stringify({ categories, audits: mocks.audit.mock.calls });
    for (const forbidden of [
      canary,
      "fixture-rotated-key",
      first.credentialsEncrypted,
      "apiKey",
      "authorization",
    ])
      expect(serialized).not.toContain(forbidden);
    expect(mocks.wake).not.toHaveBeenCalled();
    expect(mocks.db.providerConnection.upsert.mock.calls[0][0].create).not.toHaveProperty(
      "firstSyncRequestedAt",
    );
    expect(mocks.audit.mock.calls.map(([event]) => event.action)).toEqual([
      "provider.connect",
      "provider.update",
    ]);
    expect(
      await disconnectProviderConnection(
        { projectId: context.projectPublicId, providerId: id },
        context,
      ),
    ).toEqual({ ok: true });
    expect(rows.size).toBe(0);
    expect(mocks.audit.mock.calls.at(-1)?.[0].action).toBe("provider.disconnect");
  },
);

it.each(["probe", "loader", "rate-limit"] as const)(
  "sanitizes echoed keys/headers from a failing %s everywhere retained or returned",
  async (stage) => {
    const echo = new Error(
      JSON.stringify({
        apiKey: canary,
        headers: { authorization: `Bearer ${canary}`, "x-api-key": canary },
        url: `https://example.com/?key=${canary}`,
      }),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    register("openai");
    if (stage === "probe") probe.mockRejectedValue(echo);
    if (stage === "loader")
      cleanups.push(
        registerModelProvider("openai", async () => {
          throw echo;
        }),
      );
    if (stage === "rate-limit") mocks.limit.mockRejectedValue(echo);
    const error = await connectProviderConnection(input("openai"), context).catch(
      (failure: Error) => failure,
    );
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected a connection failure");
    expect(error.message).toBe("Connection test failed: Model provider connection test failed.");
    const result = await testProviderConnection(input("openai"), context);
    expect(result).toEqual({ ok: false, message: "Model provider connection test failed." });
    expect(
      JSON.stringify({
        error: error.message,
        result,
        rows: [...rows],
        audit: mocks.audit.mock.calls,
        logs: [log.mock.calls, warn.mock.calls, info.mock.calls],
      }),
    ).not.toContain(canary);
    expect(rows.size).toBe(0);
    expect(mocks.budgets).not.toHaveBeenCalled();
  },
);

it.each(["endpoint", "login"] as const)(
  "rejects extra model credential %s before probing or storing",
  async (field) => {
    register("openai");
    await expect(
      connectProviderConnection(
        {
          ...input("openai"),
          credentials: { apiKey: canary, [field]: "https://example.com/custom" },
        },
        context,
      ),
    ).rejects.toThrow("Model providers accept an API key only.");
    expect(probe).not.toHaveBeenCalled();
    expect(rows.size).toBe(0);
  },
);

it.each(["unavailable", "no_supported_models"] as const)(
  "maps %s to fixed safe failure without storing",
  async (state) => {
    register("openai");
    probe.mockResolvedValue({ state, catalog: null });
    const result = await testProviderConnection(input("openai"), context);
    expect(result).toEqual({
      ok: false,
      message:
        state === "unavailable"
          ? "Model provider is not available yet."
          : "No supported text models are available.",
    });
    await expect(connectProviderConnection(input("openai"), context)).rejects.toThrow(
      result.message,
    );
    expect(rows.size).toBe(0);
  },
);

it("discards unexpected adapter fields rather than retaining or returning echoed secrets", async () => {
  register("openai");
  probe.mockImplementation(async (ctx) => ({
    state: "catalog_available",
    catalog: catalog("openai", ctx),
    message: canary,
    headers: { authorization: canary },
  }));
  const result = await testProviderConnection(input("openai"), context);
  expect(result).toEqual({
    ok: true,
    message: "Model provider metadata access verified. Billed by your provider.",
  });
  expect(JSON.stringify({ result, audit: mocks.audit.mock.calls })).not.toContain(canary);
  expect(rows.size).toBe(0);
});

it("requires an API key and refuses a rate-limited Connect/Test without saving", async () => {
  register("openai");
  await expect(
    connectProviderConnection({ ...input("openai"), credentials: {} }, context),
  ).rejects.toThrow("Model provider requires an API key credential.");
  mocks.limit.mockResolvedValue({ success: false });
  const result = await testProviderConnection(input("openai"), context);
  expect(result).toMatchObject({ ok: false, rateLimited: true });
  await expect(connectProviderConnection(input("openai"), context)).rejects.toThrow(
    "Provider connection test is rate limited.",
  );
  expect(rows.size).toBe(0);
  expect(probe).not.toHaveBeenCalled();
});

it.each(NATIVE_MODEL_PROVIDERS)("%s listing tracks registration without loading", async (id) => {
  const listing = async () =>
    (await listProviderCategories(context.projectId))
      .find((category) => category.id === "model")
      ?.providers.find((provider) => provider.id === id);
  expect(await listing()).toMatchObject({
    status: "planned",
    meta: expect.arrayContaining([{ label: "State", value: "Not available yet" }]),
  });
  const load = register(id);
  expect(await listing()).toMatchObject({
    status: "ready",
    meta: expect.arrayContaining([{ label: "State", value: "Ready" }]),
  });
  expect(load).not.toHaveBeenCalled();
});

it.each(
  ["empty", "provider", "digest", "null"].flatMap((fault) =>
    ["connect", "test"].map((action) => [fault, action]),
  ),
)("rejects %s catalog on %s without saving a key", async (fault, action) => {
  register("openai");
  probe.mockImplementation(async (ctx) => {
    const value = catalog(fault === "provider" ? "anthropic" : "openai", ctx);
    if (fault === "empty") value.models = [];
    if (fault === "digest") value.accountDigest = "a".repeat(64);
    return {
      state: "catalog_available",
      catalog: fault === "null" ? null : value,
    } as unknown as Awaited<ReturnType<ModelProvider["probe"]>>;
  });
  const message =
    fault === "empty"
      ? "No supported text models are available."
      : "Model provider connection test failed.";
  if (action === "test")
    expect(await testProviderConnection(input("openai"), context)).toEqual({ ok: false, message });
  else await expect(connectProviderConnection(input("openai"), context)).rejects.toThrow(message);
  expect(rows.size).toBe(0);
  expect(mocks.db.providerConnection.upsert).not.toHaveBeenCalled();
});

it("enforces the deadline when the adapter ignores its signal", async () => {
  register("openai");
  const controller = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
  probe.mockImplementation(() => new Promise(() => {}));
  const result = testProviderConnection(input("openai"), context);
  await vi.waitFor(() => expect(probe).toHaveBeenCalledOnce());
  controller.abort();
  expect(
    await Promise.race([
      result,
      Promise.resolve().then(() => new Promise((resolve) => setTimeout(() => resolve("hung"), 30))),
    ]),
  ).toEqual({ ok: false, message: "Model provider connection test failed." });
  expect(rows.size).toBe(0);
});

it.each(NATIVE_MODEL_PROVIDERS)(
  "%s accepts the real drawer credential shape and never saves a tested override",
  async (id) => {
    register(id);
    await connectProviderConnection(
      {
        projectId: context.projectPublicId,
        providerId: id,
        login: "",
        secret: canary,
        enabled: true,
      },
      context,
    );
    expect(probe.mock.calls[0][0].apiKey).toBe(canary);
    const row = rows.get(key(context.projectId, id));
    if (!row) throw new Error("Missing fixture connection");
    row.status = "needs_reauth";
    const before = structuredClone(row);
    expect(
      await testProviderConnection(
        { ...input(id), credentials: undefined, secret: "fixture-tested-override" },
        context,
      ),
    ).toMatchObject({ ok: true });
    expect(rows.get(key(context.projectId, id))).toEqual(before);
    expect(mocks.db.providerConnection.upsert).toHaveBeenCalledOnce();
  },
);

it.each(NATIVE_MODEL_PROVIDERS)(
  "%s stored-key Test restores reauth without changing the key or scheduling work",
  async (id) => {
    register(id);
    await connectProviderConnection(input(id), context);
    const row = rows.get(key(context.projectId, id));
    if (!row) throw new Error("Missing fixture connection");
    row.status = "needs_reauth";
    const encrypted = row.credentialsEncrypted;
    expect(
      await testProviderConnection({ projectId: context.projectPublicId, providerId: id }, context),
    ).toMatchObject({ ok: true });
    expect(row.status).toBe("connected");
    expect(row.credentialsEncrypted).toBe(encrypted);
    expect(mocks.db.providerConnection.updateMany).toHaveBeenCalledWith({
      data: { status: "connected" },
      where: { id: row.id, status: "needs_reauth" },
    });
    expect(mocks.wake).not.toHaveBeenCalled();
  },
);

it("scopes model priority assignment and renumbering to model connections", async () => {
  const records = [
    { id: "first", provider: "openai", priority: 3 },
    { id: "second", provider: "anthropic", priority: 8 },
  ];
  const findMany = vi.fn(async () => records);
  const update = vi.fn();
  const client = { providerConnection: { findMany, update } } as never;
  expect(
    await connectedProviderChainSettings(
      context.projectId,
      "model",
      null,
      { enabled: true },
      {},
      client,
    ),
  ).toEqual({ enabled: true, priority: 9 });
  await renumberProviderChain(context.projectId, "model", "anthropic", client);
  for (const [args] of findMany.mock.calls as unknown as [{ where: unknown }][])
    expect(args.where).toEqual({ kind: "model", projectId: context.projectId });
  expect(update.mock.calls).toEqual([
    [{ data: { priority: 0 }, where: { id: "second" } }],
    [{ data: { priority: 1 }, where: { id: "first" } }],
  ]);
});

it.each(["connect", "test"])(
  "bounds a hanging loader on %s and retries only after the shared ceiling",
  async (action) => {
    vi.useFakeTimers();
    register("openai");
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(controller.signal);
    const load = vi
      .fn<() => Promise<ModelProvider>>()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({ id: "openai", probe, generate });
    cleanups.push(registerModelProvider("openai", load));
    const call = () =>
      action === "connect"
        ? connectProviderConnection(input("openai"), context).catch((error: Error) => ({
            ok: false,
            message: error.message,
          }))
        : testProviderConnection(input("openai"), context);
    const pending = call();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledOnce();
    controller.abort();
    expect(await pending).toMatchObject({ ok: false });
    expect(rows.size).toBe(0);
    expect(mocks.db.providerConnection.upsert).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await testProviderConnection(input("openai"), context)).toMatchObject({ ok: true });
    expect(load).toHaveBeenCalledTimes(2);
  },
);

it("retries a rejecting loader without retaining or leaking its rejection", async () => {
  register("openai");
  const load = vi
    .fn<() => Promise<ModelProvider>>()
    .mockRejectedValueOnce(new Error(canary))
    .mockResolvedValue({ id: "openai", probe, generate });
  cleanups.push(registerModelProvider("openai", load));
  expect(await testProviderConnection(input("openai"), context)).toEqual({
    ok: false,
    message: "Model provider connection test failed.",
  });
  expect(rows.size).toBe(0);
  expect(await testProviderConnection(input("openai"), context)).toMatchObject({ ok: true });
  expect(load).toHaveBeenCalledTimes(2);
});

it("binds the account digest to a purpose-derived server key", async () => {
  const { createHmac } = await import("node:crypto");
  const { getPurposeSecretKeys } = await import("@/lib/providers/crypto");
  register("openai");
  await testProviderConnection(input("openai"), context);
  const digest = probe.mock.calls[0][0].accountDigest;
  expect(digest).toBe(
    createHmac("sha256", getPurposeSecretKeys("bisibility:model-provider:account:v1")[0])
      .update(JSON.stringify(["openai", canary]))
      .digest("hex"),
  );
  expect(digest).not.toBe(
    createHash("sha256")
      .update(JSON.stringify(["openai", canary]))
      .digest("hex"),
  );
  vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 8).toString("base64"));
  await testProviderConnection(input("openai"), context);
  expect(probe.mock.calls[1][0].accountDigest).not.toBe(digest);
  expect(rows.size).toBe(0);
  expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(digest);
  expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(
    probe.mock.calls[1][0].accountDigest,
  );
});

it.each(["connect", "test"])(
  "refuses %s without a production digest secret before probing",
  async (action) => {
    register("openai");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BISIBILITY_SECRETS_KEY", undefined);
    vi.stubEnv("BISIBILITY_SECRETS_KEYS_RETIRED", undefined);
    if (action === "connect")
      await expect(connectProviderConnection(input("openai"), context)).rejects.toThrow(
        "Connection test failed: Model provider connection test failed.",
      );
    else
      expect(await testProviderConnection(input("openai"), context)).toEqual({
        ok: false,
        message: "Model provider connection test failed.",
      });
    expect(probe).not.toHaveBeenCalled();
    expect(rows.size).toBe(0);
    expect(mocks.db.providerConnection.upsert).not.toHaveBeenCalled();
    expect(mocks.budgets).not.toHaveBeenCalled();
  },
);

it("keeps workspace selections separate in the keyed probe account digest", async () => {
  const { probeModelProviderConnection } = await import("./model-provider-probe");
  const { modelAccountDigest } = await import("@/lib/providers/model/account-scope");
  register("anthropic");
  probe.mockImplementation(async (ctx) => ({
    state: "catalog_available",
    catalog: {
      ...catalog("anthropic", ctx),
      ...(ctx.workspaceId ? { workspaceId: ctx.workspaceId } : {}),
    },
  }));
  for (const workspaceId of [undefined, "wrkspc_SyntheticA", "wrkspc_SyntheticB"]) {
    const outcome = await probeModelProviderConnection(
      "anthropic",
      { apiKey: canary },
      context.projectId,
      workspaceId ? { workspaceId } : undefined,
    );
    expect(outcome.ok).toBe(true);
    expect(probe.mock.lastCall?.[0].accountDigest).toBe(
      modelAccountDigest("anthropic", canary, workspaceId),
    );
    expect(probe.mock.lastCall?.[0].workspaceId).toBe(workspaceId);
  }
  expect(new Set(probe.mock.calls.map(([ctx]) => ctx.accountDigest)).size).toBe(3);
  expect(generate).not.toHaveBeenCalled();
});
