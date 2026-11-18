import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { projectBudgetId } from "@/lib/metering/project-funding-budgets";
import { readSpendingBudgets } from "@/lib/metering/spending-limit-store";
import { saveModelPaymentQuote } from "./admission-storage";
import { columnCatalogRequest } from "./catalog-request";
import { type ModelConnectionResolution, recheckModelConnection } from "./connection-resolution";
import { modelFundingValuation } from "./funding-extension";
import { modelCustomerForecast } from "./funding-presentation";
import type { ModelPlaygroundQuote } from "./launch-service";
import {
  createModelPaymentQuote,
  ModelAdmissionRefusal,
  type ModelPaymentContext,
  type ModelPaymentQuote,
} from "./payment";
import type { ModelPlaygroundAccess, ModelPlaygroundRuntime } from "./runtime-contract";
import { transactionDatabase } from "./runtime-transaction";
import { createModelPlaygroundRunSchema, modelPlaygroundDraftSchema } from "./schema";
import { createModelPlaygroundStore } from "./store";
import type { ModelColumn, ModelPlaygroundPreview } from "./types";
import { modelUsageDigest } from "./usage";
import { modelOwnKeyValuation } from "./valuation-extension";

/** An unknown provider price has no advisory money reservation; usage still settles. */
export function unavailableModelValuation(column: ModelColumn) {
  return {
    policy: {
      billableDimensions: [
        "inputTokens",
        "outputTokens",
        "cacheReadInputTokens",
        "cacheWriteInputTokens",
        "reasoningTokens",
        ...(column.settings.search.mode === "off" ? [] : ["searchCalls", "searchContentTokens"]),
      ] as ModelPaymentContext["columns"][number]["binding"]["policy"]["billableDimensions"],
      cacheWriteTtls: [],
      inputCacheAccounting: "unknown" as const,
      searchContentAccounting: "unknown" as const,
    },
    rateCard: null,
    forecast: {
      amount: null,
      currency: "USD",
      certainty: "unknown" as const,
      basis: "unknown" as const,
      rateCardVersion: null,
    },
    advisory: {
      cents: "0",
      basis: "price_unknown" as const,
    },
  };
}

export async function resolveModelPaymentContext(
  runtime: ModelPlaygroundRuntime,
  tx: Prisma.TransactionClient,
  access: ModelPlaygroundAccess,
  value: unknown,
  connections: Map<string, ModelConnectionResolution>,
  frozen?: ModelPaymentQuote,
  onlyAttempt?: string,
): Promise<ModelPaymentContext> {
  const parsed = modelPlaygroundDraftSchema.safeParse(value);
  if (!parsed.success) throw new ModelAdmissionRefusal("configuration_changed");
  const input = parsed.data;
  const budgets = await readSpendingBudgets(
    tx,
    access.namespace,
    [{ kind: "group", namespace: access.namespace, group: access.projectId }],
    "read",
  );
  const budget = budgets.find((b) => b.id === projectBudgetId(access.projectId));
  if (!budget) throw new ModelAdmissionRefusal("budget_unavailable");
  const columns: ModelPaymentContext["columns"] = [];
  for (const column of input.columns) {
    const retained = frozen?.context.columns.find(
      (c) => c.binding.column.columnId === column.columnId,
    );
    if (onlyAttempt && retained?.binding.attemptId !== onlyAttempt) {
      if (!retained) throw new ModelAdmissionRefusal("configuration_changed");
      columns.push(retained);
      continue;
    }
    const connection = connections.get(column.columnId);
    if (!connection) throw new ModelAdmissionRefusal("connection_unavailable");
    const source = retained?.binding.source ?? runtime.entrySource;
    if (!source) throw new ModelAdmissionRefusal("configuration_changed");
    await recheckModelConnection(
      tx,
      access.projectId,
      columnCatalogRequest(column),
      connection,
      access.actorId,
      source,
    );
    const selected = createModelPlaygroundRunSchema(
      [connection.catalog],
      runtime.now?.() ?? new Date(),
    ).safeParse({ ...input, columns: [column] });
    if (!selected.success) throw new ModelAdmissionRefusal("catalog_changed");
    const platform = connection.fundingSource === "platform";
    if (
      column.payment.optionId !== (platform ? column.connectionId : `byok:${column.connectionId}`)
    )
      throw new ModelAdmissionRefusal("configuration_changed");
    const entry = connection.catalog.models.find((m) => m.modelId === column.modelId);
    if (!entry) throw new ModelAdmissionRefusal("catalog_changed");
    const funded = platform ? await modelFundingValuation(tx, column, input, connection) : null;
    const valuation =
      funded ??
      runtime.valuation?.(column, input) ??
      modelOwnKeyValuation(column, input) ??
      unavailableModelValuation(column);
    if (platform && !funded) throw new ModelAdmissionRefusal("rate_card_changed");
    columns.push({
      binding: {
        version: 1,
        feature: "model_playground",
        fundingSource: platform ? "platform" : "byok",
        ...(funded ? { platform: funded.platform } : {}),
        // Execution and recovery retain the original request's attribution.
        source,
        attemptId: retained?.binding.attemptId ?? "pending",
        projectId: access.projectId,
        principal: access.principal,
        connectionId: connection.id,
        credentialVersion: connection.credentialVersion,
        accountDigest: connection.accountDigest,
        configHash: modelUsageDigest(input),
        capabilityVersion: entry.capabilityVersion,
        column,
        policy: valuation.policy,
        rateCard: valuation.rateCard,
      },
      // Fetch timestamps are cache freshness, not a capability revision.
      catalogRevision: modelUsageDigest({
        ...connection.catalog,
        fetchedAt: undefined,
        expiresAt: undefined,
      }),
      maxOutputTokens: entry.maxOutputTokens,
      forecast: valuation.forecast,
      advisory: valuation.advisory,
    });
  }
  return { ...access, input, budget: { id: budget.id, version: budget.version }, columns };
}

export function modelStoredPreview(quote: ModelPaymentQuote): ModelPlaygroundPreview {
  return {
    version: 1,
    previewId: quote.quoteId,
    projectId: quote.context.projectId,
    configHash: quote.configHash,
    createdAt: quote.createdAt,
    expiresAt: quote.expiresAt,
    input: quote.context.input,
    columns: quote.context.columns.map(({ binding: b, forecast }) => ({
      columnId: b.column.columnId,
      accountDigest: b.accountDigest,
      credentialVersion: b.credentialVersion,
      capabilityVersion: b.capabilityVersion,
      rateCardVersion: b.rateCard?.version ?? null,
      providerEstimate: forecast,
    })),
  };
}

export async function previewModelPlayground(
  runtime: ModelPlaygroundRuntime,
  request: { revision: string; input: unknown },
): Promise<ModelPlaygroundQuote> {
  const access = await runtime.authorize("create");
  if (typeof request.revision !== "string" || request.revision.length > 256)
    throw new ModelAdmissionRefusal("configuration_changed");
  const connections = await prepareModelConnections(runtime, access, request.input);
  const { context, quote } = await runtime.db.$transaction(async (tx) => {
    const context = await resolveModelPaymentContext(
      runtime,
      tx,
      access,
      request.input,
      connections,
    );
    const quote = createModelPaymentQuote(context, runtime.now?.());
    const db = transactionDatabase(tx);
    await saveModelPaymentQuote(db, quote);
    await createModelPlaygroundStore(db).savePreview(modelStoredPreview(quote), access.actorId);
    return { context, quote };
  });
  return {
    revision: request.revision,
    previewId: quote.quoteId,
    quoteToken: quote.quoteId,
    configHash: quote.configHash,
    expiresAt: quote.expiresAt,
    forecasts: context.columns.map((c) => ({
      columnId: c.binding.column.columnId,
      money: modelCustomerForecast(c.binding, c.forecast),
      complete: c.forecast.certainty !== "unknown",
    })),
  };
}

export async function prepareModelConnections(
  runtime: ModelPlaygroundRuntime,
  access: ModelPlaygroundAccess,
  value: unknown,
) {
  const input = modelPlaygroundDraftSchema.safeParse(value);
  if (!input.success) throw new ModelAdmissionRefusal("configuration_changed");
  const connections = new Map<string, ModelConnectionResolution>();
  for (const column of input.data.columns)
    connections.set(
      column.columnId,
      await runtime.resolve(runtime.db, access.projectId, columnCatalogRequest(column)),
    );
  return connections;
}
