import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  capabilities: vi.fn(),
  paid: vi.fn(),
  preflight: vi.fn(),
  prompt: vi.fn(),
  update: vi.fn(),
  reports: new Map<string, any>(),
  authoritativeSource: "own",
  failFinalWrite: false,
  receipts: [] as any[],
  failCleanup: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/metering/entry-sync", () => ({ syncUsageEntry: vi.fn() }));
vi.mock("./context", () => ({ requireAiSource: mocks.source }));
vi.mock("./catalog-service", () => ({ loadAiResearchCapabilities: mocks.capabilities }));
vi.mock("./provider", () => ({
  fetchPrompt: mocks.prompt,
  fetchObserved: vi.fn(),
  supportedPromptModels: vi.fn(),
  PROMPT_PATH: "chat_gpt/llm_responses/live",
  VISIBILITY_PATH: "llm_mentions/search_mentions/live",
}));
vi.mock("@/lib/provider-lookups/paid-call", async () => ({
  ProviderLookupSignal: (await import("@/lib/provider-lookups/lookup-failure"))
    .ProviderLookupSignal,
  paidProviderCall: mocks.paid,
  preflightProviderBudget: mocks.preflight,
}));
vi.mock("@/lib/db/prisma", () => {
  const tx = {
    $executeRaw: vi.fn(),
    project: { findUniqueOrThrow: vi.fn(async () => ({ id: "project", writeMode: "active" })) },
    providerCostEntry: {
      updateMany: vi.fn(async () => {
        if (mocks.failCleanup) throw new Error("Fictional cleanup commit unavailable");
        return { count: 0 };
      }),
      findMany: vi.fn(async ({ where }: any) =>
        mocks.receipts.filter(
          (row) =>
            row.projectId === where.projectId &&
            row.connectionId === where.connectionId &&
            row.provider === where.provider &&
            row.feature === where.feature &&
            row.credentialSource === where.credentialSource &&
            (where.tag.in ? where.tag.in.includes(row.tag) : row.tag != null) &&
            (!where.measurementStatus || row.measurementStatus === where.measurementStatus) &&
            (where.providerRequestId !== null || row.providerRequestId === null),
        ),
      ),
    },
    agentReport: {
      findFirst: vi.fn(
        async ({ where }: any) =>
          [...mocks.reports.values()].find(
            (row) =>
              row.projectId === where.projectId &&
              row.kind === where.kind &&
              where.AND.every((condition: any) => {
                const clause = condition.provenance;
                const stored = row.provenance[clause.path[0]];
                return clause.array_contains
                  ? clause.array_contains.every((tag: string) => stored?.includes(tag))
                  : stored === clause.equals;
              }),
          ) ?? null,
      ),
      findUnique: vi.fn(async ({ where }: any) => mocks.reports.get(where.id) ?? null),
      findMany: vi.fn(async ({ where }: any) =>
        [...mocks.reports.values()].filter(
          (row) =>
            row.projectId === where.projectId &&
            ["pending", "unknown"].includes(row.provenance.actualCostState),
        ),
      ),
      create: vi.fn(async ({ data }: any) => {
        const row = structuredClone(data);
        mocks.reports.set(row.id, row);
        return row;
      }),
      update: mocks.update,
    },
  };
  let serial = Promise.resolve();
  return {
    prisma: {
      ...tx,
      $transaction: (call: any) => {
        const result = serial.then(() => call(tx));
        serial = result.catch(() => undefined);
        return result;
      },
    },
  };
});
vi.mock("@/lib/agent-reports/service", () => ({ createAgentReport: vi.fn() }));
vi.mock("@/lib/provider-lookups/cache", () => ({
  withProviderLookupCache: vi.fn(() => {
    throw new Error("Actual-cost requests must not rely on fail-open Redis.");
  }),
}));

import { postPromptExplorer } from "@/lib/api/ai-research";
import type { ApiContext } from "@/lib/api/context";
import { dispatchResearchWorkspaceTool } from "@/lib/mcp/research-workspace-tools";
import { ProviderLookupSignal } from "@/lib/provider-lookups/lookup-failure";
import { ProviderCallError } from "@/lib/providers/call-error";
import { credentialReference } from "./actual-cost";
import { capabilities } from "./catalog-fixtures.test-support";
import { promptSchema } from "./schema";
import { compareAiPrompts } from "./service";

const connection = {
  id: "connection",
  provider: "dataforseo",
  credentialSource: "own",
  credentialsEncrypted: "fictional-encrypted-reference",
};
const context = { projectId: "project", actorId: "actor", origin: { source: "app" as const } };
const input = {
  brand: "Acme",
  domain: "acme.com",
  prompt: "Acme?",
  models: ["gpt-4.1-mini", "gpt-4.1-nano"],
  cost_policy: "provider_actual_cost",
  actual_cost_acknowledgement: "non_guaranteed_estimate_v1",
  estimated_cost_limit_cents: 10,
  idempotency_key: "12345678-1234-4234-8234-123456789012",
  estimate_credentials_ref: credentialReference(connection),
};
const row = {
  prompt: "Acme?",
  answer: "Acme",
  model: "gpt-4.1-mini",
  observedAt: null,
  brandMentioned: true,
  domainCited: false,
  citations: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.reports.clear();
  mocks.authoritativeSource = "own";
  mocks.failFinalWrite = false;
  mocks.receipts = [];
  mocks.failCleanup = false;
  mocks.source.mockResolvedValue({
    connection,
    project: { id: "project", budgetCapCents: 100 },
    provider: { id: "dataforseo" },
  });
  mocks.capabilities.mockResolvedValue(capabilities);
  mocks.preflight.mockResolvedValue(undefined);
  mocks.update.mockImplementation(async ({ where, data }) => {
    if (mocks.failFinalWrite && data.body) throw new Error("Fictional receipt persistence failure");
    const row = structuredClone({ ...mocks.reports.get(where.id), ...data });
    mocks.reports.set(where.id, row);
    return row;
  });
  mocks.paid.mockImplementation(async ({ call, requiredCredentialSource }) => {
    expect(requiredCredentialSource).toBe("own");
    if (mocks.authoritativeSource !== "own")
      throw new ProviderLookupSignal({ ok: false, reason: "own_credentials_required" });
    return call({}, { tag: `fictional-tag-${mocks.paid.mock.calls.length}` });
  });
  mocks.prompt.mockImplementation(async (...args) => {
    args[6]?.();
    return {
      row: { ...row, model: args[2] },
      costCents: 0.1234,
      providerRequestId: "fictional-provider-receipt",
    };
  });
});
describe("Actual provider cost with fictional dispatch only", () => {
  it("strictly separates consent/advisory from guaranteed max-cost semantics", () => {
    expect(promptSchema.safeParse({ ...input, max_cost_cents: 10 }).success).toBe(false);
    expect(
      promptSchema.safeParse({ ...input, actual_cost_acknowledgement: undefined }).success,
    ).toBe(false);
    expect(promptSchema.safeParse({ ...input, idempotency_key: undefined }).success).toBe(false);
    expect(promptSchema.safeParse({ ...input, estimate_credentials_ref: undefined }).success).toBe(
      false,
    );
    expect(
      promptSchema.safeParse({
        ...input,
        estimate_only: true,
        idempotency_key: undefined,
        estimate_credentials_ref: undefined,
      }).success,
    ).toBe(true);
    expect(
      promptSchema.safeParse({ ...input, cost_policy: "hard_cap", max_cost_cents: 60 }).success,
    ).toBe(false);
  });
  it("requires own credentials even for estimates; credits cannot forecast or execute", async () => {
    mocks.source.mockResolvedValue({
      connection: { ...connection, credentialSource: "hosted" },
      project: { id: "project" },
      provider: { id: "dataforseo" },
    });
    expect(await compareAiPrompts(context, { ...input, estimate_only: true })).toMatchObject({
      ok: false,
      reason: "own_credentials_required",
    });
    expect(mocks.capabilities).not.toHaveBeenCalled();
    expect(mocks.paid).not.toHaveBeenCalled();
  });
  it("returns an explicitly non-guaranteed fresh forecast, never an admission bound", async () => {
    expect(await compareAiPrompts(context, { ...input, estimate_only: true })).toMatchObject({
      ok: true,
      estimate: true,
      estimateKind: "forecast",
      isGuaranteedMaximum: false,
      isPartialEstimate: true,
      forecastScope: "tokens_and_base_only",
      credentialSource: "own",
      estimateCredentialsRef: credentialReference(connection),
    });
    expect(mocks.reports.size).toBe(0);
    expect(mocks.paid).not.toHaveBeenCalled();
  });
  it("refuses changed estimate credentials before provider metadata or paid dispatch", async () => {
    expect(
      await compareAiPrompts(context, { ...input, estimate_credentials_ref: "a".repeat(64) }),
    ).toMatchObject({ ok: false, reason: "credentials_changed" });
    expect(mocks.capabilities).not.toHaveBeenCalled();
    expect(mocks.paid).not.toHaveBeenCalled();
  });
  it("rechecks own-only at the paid boundary after a connection source race", async () => {
    mocks.authoritativeSource = "hosted";
    expect(await compareAiPrompts(context, input)).toMatchObject({
      ok: false,
      reason: "own_credentials_required",
    });
    expect(mocks.prompt).not.toHaveBeenCalled();
    expect([...mocks.reports.values()][0].provenance.actualCostState).toBe("refused");
  });
  it("stores measured receipts only and replays without another paid call even fresh", async () => {
    const first = await compareAiPrompts(context, input);
    expect(first).toMatchObject({
      ok: true,
      estimate: false,
      cached: false,
      costCents: 0.2468,
      retryBlocked: false,
    });
    expect(mocks.paid).toHaveBeenCalledTimes(2);
    mocks.capabilities.mockRejectedValue(new Error("Replay must not use pricing"));
    expect(await compareAiPrompts(context, { ...input, fresh: true })).toMatchObject({
      ok: true,
      cached: true,
      costCents: 0,
    });
    expect(mocks.paid).toHaveBeenCalledTimes(2);
    const saved = [...mocks.reports.values()][0];
    expect(saved.provenance).toMatchObject({
      costPolicy: "provider_actual_cost",
      actualCostState: "confirmed",
      isGuaranteedMaximum: false,
      usageTags: ["fictional-tag-1", "fictional-tag-2"],
    });
    expect(saved.provenance.admissionBoundCents).toBeUndefined();
  });
  it("binds the request ID to options, acknowledgement and advisory limit", async () => {
    await compareAiPrompts(context, input);
    for (const changed of [
      { estimated_cost_limit_cents: 11 },
      { prompt: "changed" },
      { max_output_tokens: 1024 },
    ])
      expect(await compareAiPrompts(context, { ...input, ...changed })).toMatchObject({
        ok: false,
        reason: "idempotency_conflict",
      });
    expect(mocks.paid).toHaveBeenCalledTimes(2);
  });
  it("keeps a UUID bound across replacement provider connections", async () => {
    await compareAiPrompts(context, input);
    const replacement = { ...connection, id: "replacement-connection" };
    mocks.source.mockResolvedValue({
      connection: replacement,
      project: { id: "project", budgetCapCents: 100 },
      provider: { id: "dataforseo" },
    });
    expect(
      await compareAiPrompts(context, {
        ...input,
        estimate_credentials_ref: credentialReference(replacement),
      }),
    ).toMatchObject({ ok: false, reason: "idempotency_conflict", retryBlocked: true });
    expect(mocks.paid).toHaveBeenCalledTimes(2);
    expect(mocks.reports.size).toBe(1);
  });
  it("stops serial dispatch after measured cost exceeds the advisory, without reconstructing token charges", async () => {
    mocks.prompt.mockImplementation(async (...args) => {
      args[6]?.();
      return { row, costCents: 2, providerRequestId: "fictional-receipt" };
    });
    expect(
      await compareAiPrompts(context, { ...input, estimated_cost_limit_cents: 1 }),
    ).toMatchObject({
      ok: true,
      costCents: 2,
      result: { truncated: true, costStatus: "confirmed" },
    });
    expect(mocks.paid).toHaveBeenCalledTimes(1);
  });
  it("never retries unknown cost with fresh, a new key, or a changed advisory", async () => {
    mocks.prompt.mockImplementation(async (...args) => {
      args[6]?.();
      throw new ProviderCallError("Fictional timeout after dispatch", null);
    });
    expect(await compareAiPrompts(context, input)).toMatchObject({
      ok: true,
      retryBlocked: true,
      result: { costStatus: "unknown" },
    });
    expect(await compareAiPrompts(context, { ...input, fresh: true })).toMatchObject({
      ok: false,
      reason: "usage_reconciliation_required",
    });
    expect(
      await compareAiPrompts(context, {
        ...input,
        idempotency_key: "12345678-1234-4234-8234-123456789013",
      }),
    ).toMatchObject({ ok: false, reason: "usage_reconciliation_required" });
    expect(
      await compareAiPrompts(context, { ...input, estimated_cost_limit_cents: 20 }),
    ).toMatchObject({ ok: false, reason: "idempotency_conflict" });
    expect(mocks.paid).toHaveBeenCalledTimes(1);
  });
  it("keeps a durable pending barrier if final receipt persistence fails", async () => {
    mocks.failFinalWrite = true;
    await expect(compareAiPrompts(context, input)).rejects.toThrow(
      "Fictional receipt persistence failure",
    );
    expect([...mocks.reports.values()][0].provenance.actualCostState).toBe("pending");
    expect(await compareAiPrompts(context, { ...input, fresh: true })).toMatchObject({
      ok: false,
      reason: "usage_reconciliation_required",
    });
    expect(mocks.paid).toHaveBeenCalledTimes(2);
  });
  it("requires fresh forecasts in actual mode even for original mini/nano512", async () => {
    mocks.capabilities.mockRejectedValue(new Error("Fictional source outage"));
    expect(await compareAiPrompts(context, input)).toMatchObject({
      ok: false,
      reason: "pricing_unavailable",
    });
    expect(mocks.paid).not.toHaveBeenCalled();
  });
  it.each(["journal_begin", "deadline"])(
    "releases only proven tagged no-dispatch %s refusals",
    async () => {
      mocks.prompt.mockRejectedValue(new Error("Fictional refusal before any POST"));
      expect(await compareAiPrompts(context, input)).toMatchObject({
        ok: false,
        safeToStartNewRequest: true,
        retryBlocked: false,
      });
      const saved = [...mocks.reports.values()][0];
      expect(saved.provenance).toMatchObject({
        actualCostState: "refused",
        usageTags: [],
        noDispatchTags: ["fictional-tag-1"],
      });
      expect(await compareAiPrompts(context, input)).toMatchObject({
        ok: false,
        reason: "request_already_refused",
        safeToStartNewRequest: true,
      });
      expect(mocks.paid).toHaveBeenCalledTimes(1);
    },
  );
  it("retains pending proof after zero-receipt cleanup failure and safely reconciles without paid retry", async () => {
    mocks.failCleanup = true;
    mocks.receipts = [
      {
        id: "unknown-entry",
        projectId: "project",
        connectionId: "connection",
        provider: "dataforseo",
        feature: "prompt_explorer",
        credentialSource: "own",
        tag: "fictional-tag-1",
        measurementStatus: "unknown",
        providerRequestId: null,
      },
    ];
    mocks.prompt.mockRejectedValue(new Error("Fictional proven no POST"));
    await expect(compareAiPrompts(context, input)).rejects.toThrow(
      "Fictional cleanup commit unavailable",
    );
    const saved = [...mocks.reports.values()][0];
    expect(saved.provenance).toMatchObject({
      actualCostState: "pending",
      noDispatchTags: ["fictional-tag-1"],
      usageTags: [],
    });
    await expect(compareAiPrompts(context, input)).rejects.toThrow(
      "Fictional cleanup commit unavailable",
    );
    saved.provenance.executionDeadlineAt = Date.now() - 1;
    mocks.failCleanup = false;
    expect(await compareAiPrompts(context, input)).toMatchObject({
      ok: false,
      reason: "request_already_refused",
      safeToStartNewRequest: true,
    });
    expect(mocks.paid).toHaveBeenCalledTimes(1);
  });
  it("serializes distinct UUIDs behind the same project pending reservation", async () => {
    let release!: () => void;
    let entered!: () => void;
    const began = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.prompt.mockImplementationOnce(async (...args) => {
      args[6]?.();
      entered();
      await waiting;
      return { row, costCents: 1 };
    });
    const first = compareAiPrompts(context, { ...input, estimated_cost_limit_cents: 1 });
    await began;
    expect(
      await compareAiPrompts(context, {
        ...input,
        idempotency_key: "12345678-1234-4234-8234-123456789099",
      }),
    ).toMatchObject({ ok: false, reason: "usage_reconciliation_required" });
    expect(mocks.paid).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
  it("marks missing source refusal safe before reserving or dispatching", async () => {
    mocks.source.mockRejectedValue(new ProviderLookupSignal({ ok: false, reason: "no_source" }));
    expect(await compareAiPrompts(context, input)).toMatchObject({
      ok: false,
      reason: "no_source",
      safeToStartNewRequest: true,
      retryBlocked: false,
    });
    expect(mocks.reports.size).toBe(0);
    expect(mocks.paid).not.toHaveBeenCalled();
  });
  it("stops the next model when measured spend exactly reaches the advisory", async () => {
    mocks.prompt.mockImplementation(async (...args) => {
      args[6]?.();
      return { row, costCents: 1 };
    });
    expect(
      await compareAiPrompts(context, { ...input, estimated_cost_limit_cents: 1 }),
    ).toMatchObject({ ok: true, costCents: 1, result: { truncated: true } });
    expect(mocks.paid).toHaveBeenCalledTimes(1);
  });
  it("does not freeze charged-first/no-POST-second reconciliation after final write failure", async () => {
    mocks.failFinalWrite = true;
    mocks.prompt
      .mockImplementationOnce(async (...args) => {
        args[6]?.();
        return { row, costCents: 0.1234 };
      })
      .mockRejectedValueOnce(new Error("Fictional second model pre-dispatch refusal"));
    await expect(compareAiPrompts(context, input)).rejects.toThrow(
      "Fictional receipt persistence failure",
    );
    const saved = [...mocks.reports.values()][0];
    expect(saved.provenance).toMatchObject({
      actualCostState: "pending",
      usageTags: ["fictional-tag-1"],
      noDispatchTags: ["fictional-tag-2"],
    });
    saved.provenance.executionDeadlineAt = Date.now() - 1;
    mocks.receipts = [
      {
        projectId: "project",
        connectionId: "connection",
        provider: "dataforseo",
        feature: "prompt_explorer",
        credentialSource: "own",
        tag: "fictional-tag-1",
        measurementStatus: "recorded",
        costCents: "0.1234",
        usageQuantity: 1,
        providerRequestId: "fictional-task",
      },
    ];
    mocks.failFinalWrite = false;
    mocks.capabilities.mockRejectedValue(new Error("Replay cannot fetch pricing"));
    expect(await compareAiPrompts(context, input)).toMatchObject({
      ok: true,
      cached: true,
      costCents: 0,
      result: { costCents: 0.1234, costStatus: "confirmed" },
    });
    expect(mocks.paid).toHaveBeenCalledTimes(2);
  });
  it("requires recorded receipts for every dispatched tag before resolving unknown cost", async () => {
    mocks.prompt.mockImplementation(async (...args) => {
      args[6]?.();
      throw new ProviderCallError("Fictional uncertain receipt", null);
    });
    await compareAiPrompts(context, input);
    mocks.receipts = [
      {
        projectId: "project",
        connectionId: "wrong-connection",
        provider: "dataforseo",
        feature: "prompt_explorer",
        credentialSource: "own",
        tag: "fictional-tag-1",
        measurementStatus: "recorded",
        costCents: "0.1234",
        usageQuantity: 1,
      },
    ];
    expect(await compareAiPrompts(context, input)).toMatchObject({
      ok: false,
      reason: "usage_reconciliation_required",
    });
    mocks.receipts[0].connectionId = "connection";
    mocks.receipts[0].measurementStatus = "unknown";
    expect(await compareAiPrompts(context, input)).toMatchObject({
      ok: false,
      reason: "usage_reconciliation_required",
    });
    mocks.receipts[0].measurementStatus = "recorded";
    expect(await compareAiPrompts(context, input)).toMatchObject({
      ok: true,
      cached: true,
      result: { costStatus: "confirmed", costCents: 0.1234 },
    });
    expect(mocks.paid).toHaveBeenCalledTimes(1);
  });
  it.each(["REST", "MCP"])(
    "executes explicit consent through the %s boundary with stable body UUID",
    async (surface) => {
      const publicId = "prj_a00000000000000000000000";
      const routed =
        surface === "MCP"
          ? dispatchResearchWorkspaceTool("compareAiPrompts", { project_id: publicId, ...input })!
          : { body: input };
      expect(routed.body).toHaveProperty("idempotency_key", input.idempotency_key);
      const req = new Request("http://fixture.invalid", {
        method: "POST",
        body: JSON.stringify(routed.body),
      });
      const response = await postPromptExplorer(
        {
          req,
          headers: new Headers(),
          instance: "/fixture",
          auth: { project: { id: "project", publicId } },
          origin: {
            source: surface === "MCP" ? "mcp" : "api",
            credentialKind: "project_key",
            credentialId: "fictional-key",
          },
        } as ApiContext,
        publicId,
      );
      expect(response.status).toBe(200);
      expect((await response.json()).data.cost_cents).toBe(0.2468);
    },
  );
  it("admits fresh new reasoning/search only with explicit own actual-cost consent", async () => {
    const model = {
      ...capabilities.catalog.models[0],
      id: "gpt-5-mini",
      reasoning: true,
      minOutputTokens: 1024,
      admissionEnabled: false,
      actualCostEnabled: true,
    };
    mocks.capabilities.mockResolvedValue({
      ...capabilities,
      catalog: { ...capabilities.catalog, models: [model] },
      modelRates: new Map([[model.id, capabilities.modelRates.get("gpt-4.1-mini")]]),
    });
    expect(
      await compareAiPrompts(context, {
        ...input,
        models: [model.id],
        max_output_tokens: 1024,
        web_search: true,
        country_iso_code: "PL",
      }),
    ).toMatchObject({ ok: true, estimate: false });
    expect(mocks.paid).toHaveBeenCalledTimes(1);
  });
});
