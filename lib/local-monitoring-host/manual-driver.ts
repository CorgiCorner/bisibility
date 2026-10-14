import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ManualLocalDriverFactory } from "@/lib/local-monitor-launch/driver";
import { assertLocalCapability } from "@/lib/local-monitoring/capability";
import type { LocalSubmitCollectAdapter } from "@/lib/local-monitoring/execution-types";
import type { LocalQuote } from "@/lib/local-monitoring/quote";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import type { ExecutionTargetV1, PointRevision } from "@/lib/local-monitoring/types";
import { localDigest, localKeywordRevision } from "@/lib/local-monitoring-store/canonical";
import {
  MAPS_PRICE_EXPIRES_AT,
  mapsPriceCurrent,
} from "@/lib/provider-rates/dataforseo-maps-module";
import { buildProviderTag } from "@/lib/provider-usage/tag";
import { createMapsAdapter } from "@/lib/providers/local-search/maps-adapter";
import { mapsCapability, mapsTaskRequest } from "@/lib/providers/local-search/maps-capability";
import { bindRetainedLocalAdapter } from "./adapter";
import { type MapsConnection, readMapsConnection } from "./maps-connection";
import { assertMapsDefinition, mapsBinding, mapsPolicy } from "./maps-policy";
import {
  assertMapsPricedRequest,
  assertMapsTaskset,
  priceMapsRequest,
  sumMapsNative,
} from "./maps-pricing";
import { mapsSubmitTransport } from "./maps-transport";

export const resolveManualLocalDriver: ManualLocalDriverFactory = async (tx, input) => {
  const { definition, scope } = input;
  const clock = () => new Date();
  if (definition.axes.surface !== "maps" || definition.axes.language !== "en")
    return { kind: "unavailable", reason: "unsupported" };
  if (!mapsPriceCurrent(clock())) return { kind: "unavailable", reason: "pricing_unavailable" };
  await assertMapsDefinition(tx, scope.project.id, definition);
  const capability = mapsCapability(clock());
  const targetFor = (
    keyword: (typeof definition.keywords)[number],
    point: PointRevision,
  ): ExecutionTargetV1 => ({
    version: 1,
    projectId: scope.project.id,
    keywordId: keyword.id,
    keywordRevision: localKeywordRevision(keyword),
    pointRevision: point.revisionKey,
    policyRevision: definition.grid.revisionId,
    ...definition.axes,
  });
  const allTargets = definition.keywords.flatMap((keyword) =>
    definition.grid.points.map(({ point }) => ({ target: targetFor(keyword, point), point })),
  );
  const targets = input.retryTargetKeys
    ? allTargets.filter(({ target }) => input.retryTargetKeys?.includes(executionTargetKey(target)))
    : allTargets;
  if (
    input.retryTargetKeys &&
    (new Set(input.retryTargetKeys).size !== input.retryTargetKeys.length ||
      targets.length !== input.retryTargetKeys.length)
  )
    throw new Error("Retry target is outside the original Maps definition.");
  if (!targets.length || targets.length > 100)
    return { kind: "unavailable", reason: "unsupported" };
  const expected = targets.map(({ target, point }) => {
    assertLocalCapability(target, capability, clock());
    return mapsTaskRequest(mapsBinding(scope.project.id, definition, target, point));
  });
  let connection: MapsConnection;
  try {
    connection = await readMapsConnection(tx, scope.project.id, input.connectionPublicId);
  } catch {
    return { kind: "unavailable", reason: "connection_unavailable" };
  }
  let initial: Awaited<ReturnType<typeof priceMapsRequest>>;
  try {
    initial = await priceMapsRequest(tx, connection, expected[0], clock());
  } catch {
    return { kind: "unavailable", reason: "pricing_unavailable" };
  }
  const providerPriceVersion = initial.priceVersion;
  const policy = mapsPolicy(scope.project.id, definition);
  const assertPreparedQuote: LocalSubmitCollectAdapter["assertPreparedQuote"] = async (
    request,
    quote,
  ) => {
    const original = expected.find(
      (value) =>
        localDigest(typeof value.body === "string" ? JSON.parse(value.body) : value.body) ===
        localDigest(request.parsed.body),
    );
    if (!original) throw new Error("Maps request is outside the frozen definition.");
    assertMapsPricedRequest(request, original, scope.project.id, providerPriceVersion);
    if (
      quote.providerPriceVersion !== providerPriceVersion ||
      quote.capabilityVersion !== capability.version
    )
      throw new Error("Maps quote changed.");
  };
  const unavailable = async (): Promise<never> => {
    throw new Error("Bind an original admitted Maps item before transport.");
  };
  const adapter: LocalSubmitCollectAdapter = {
    capability,
    providerPriceVersion,
    buildRequest: ({ target, point }) =>
      mapsTaskRequest(mapsBinding(scope.project.id, definition, target, point)),
    assertPreparedQuote,
    submit: unavailable,
    assertRetrieval: unavailable,
    collect: unavailable,
  };
  return {
    kind: "ready",
    driver: {
      ports: {
        clock,
        policy,
        adapter,
        activation: {
          async assertRegistered(client, current) {
            await assertMapsDefinition(client, scope.project.id, definition);
            if (localDigest(current) !== localDigest(capability) || !mapsPriceCurrent(clock()))
              throw new Error("Maps capability changed.");
          },
          async verifyConsent(client, value) {
            if (
              value.projectId !== scope.project.id ||
              value.actorId !== scope.actor.id ||
              value.connectionPublicId !== connection.publicId
            )
              throw new Error("Maps consent custody changed.");
            return Promise.all(
              value.operations.map(async ({ targetKey, operationKey }) => {
                const index = targets.findIndex(
                  ({ target }) => executionTargetKey(target) === targetKey,
                );
                if (index < 0) throw new Error("Maps consent target changed.");
                const quote = await priceMapsRequest(
                  client,
                  connection,
                  expected[index],
                  value.now,
                );
                const cents = quote.quantities.find((quantity) => quantity.unit === "cents");
                if (!cents || quote.priceVersion !== providerPriceVersion)
                  throw new Error("Maps price changed.");
                const amount = sumMapsNative([[cents]])[0].amount;
                const context = {
                  correlationId: operationKey,
                  feature: "local_scan" as const,
                  projectId: scope.project.id,
                  source: input.source ?? "app",
                  trigger: input.trigger ?? "manual",
                };
                return {
                  targetKey,
                  binding: {
                    projectId: scope.project.id,
                    connectionId: connection.id,
                    provider: "dataforseo",
                    credentialVersion: connection.version,
                    unit: "cents" as const,
                    estimate: { cents: amount, units: "1" },
                    attribution: {
                      context,
                      tag: buildProviderTag({
                        context,
                        instanceSlug: null,
                        credentialSource: "own",
                      }),
                    },
                  },
                };
              }),
            );
          },
          async assertPreparedTaskset(client, value) {
            await assertMapsDefinition(client, scope.project.id, definition);
            for (const request of value.requests) await assertPreparedQuote(request, value.quote);
            assertMapsTaskset(value.quote, value.requests);
          },
        },
      },
      async quote(client, value): Promise<LocalQuote> {
        await assertMapsDefinition(client, scope.project.id, definition);
        if (
          value.projectId !== scope.project.id ||
          value.targets.length !== targets.length ||
          value.targets.some(
            ({ target }) =>
              !targets.some((row) => executionTargetKey(row.target) === executionTargetKey(target)),
          ) ||
          new Set(value.targets.map(({ target }) => executionTargetKey(target))).size !==
            targets.length
        )
          throw new Error("Incomplete Maps monitor selection.");
        const rows = [];
        for (const { target, point } of value.targets)
          rows.push(
            await priceMapsRequest(
              client,
              connection,
              mapsTaskRequest(mapsBinding(scope.project.id, definition, target, point)),
              value.now,
            ),
          );
        if (rows.some((row) => row.priceVersion !== providerPriceVersion))
          throw new Error("Maps price changed.");
        return {
          version: 1,
          projectId: scope.project.id,
          expectedTargetKeys: value.targets.map(({ target }) => executionTargetKey(target)),
          capabilityVersion: capability.version,
          provider: "dataforseo",
          adapterVersion: capability.adapterVersion,
          providerPriceVersion,
          nativeEstimates: sumMapsNative(rows.map((row) => row.quantities)),
          issuedAt: value.now.toISOString(),
          expiresAt: new Date(
            Math.min(
              value.now.getTime() + 120_000,
              Date.parse(capability.expiresAt),
              Date.parse(MAPS_PRICE_EXPIRES_AT),
            ),
          ).toISOString(),
          effectiveOptions: {
            surface: "maps",
            priority: "normal",
            mode: "task",
            ...Object.fromEntries(
              Object.entries(definition.axes).map(([key, value]) => [key, String(value)]),
            ),
          },
        };
      },
      bindPreparedItem(item) {
        const binding = mapsBinding(scope.project.id, definition, item.target, item.point);
        const request = mapsTaskRequest(binding);
        const transport = mapsSubmitTransport({
          db: prisma,
          scope,
          connection,
          item,
          expected: request,
          quoteHash: item.record.quoteHash,
          providerPriceVersion,
          capability,
          clock,
        });
        const bound = createMapsAdapter({
          binding,
          capability,
          providerPriceVersion,
          ports: {
            ...transport,
            clock,
            assertPreparedQuote,
            assertRetrieval: unavailable,
            retrieveEnvelope: unavailable,
          },
        });
        return bindRetainedLocalAdapter({
          adapter: bound,
          binding,
          db: prisma,
          buildRequest: mapsTaskRequest,
        }).adapter;
      },
    },
  };
};
