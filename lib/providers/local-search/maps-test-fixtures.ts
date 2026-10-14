import { preparePaidAttempt } from "@/lib/metering/current-paid-quote";
import { createDataForSeoLocalModule } from "@/lib/provider-rates/dataforseo-finder-module";
import { MAPS_POST_OPERATION } from "@/lib/provider-rates/dataforseo-maps-module";
import { createMeter } from "@usagekit/meter";
import { createCatalog, PricedRequest } from "@usagekit/providers";
import { createMemoryStore } from "@usagekit/store";
import { MAPS_ADAPTER_VERSION, mapsCapability, mapsTaskRequest } from "./maps-capability";
import { localBindingFixture, nativeIds, receiptTime, settledRecord } from "./test-fixtures";

export { nativeIds, receiptTime };
export function mapsFixture(binding = localBindingFixture()) {
  const capability = mapsCapability(receiptTime);
  const request = mapsTaskRequest(binding);
  const catalog = createCatalog({
    providers: [createDataForSeoLocalModule(() => new Date("2026-10-14T10:00:00.000Z"))],
    enabled: ["dataforseo"],
    now: () => new Date("2026-10-14T10:00:00.000Z"),
  });
  const match = catalog.match("dataforseo", request);
  if (match.operation === "unknown") throw new Error("Fixture is not a registered Maps operation.");
  const quote = catalog.estimate(
    { id: "connection", provider: "dataforseo", fundingSource: "byok" },
    match.operation.id,
    match.options,
  );
  const record = {
    ...settledRecord(binding),
    adapterVersion: MAPS_ADAPTER_VERSION,
    outcome: {
      ...settledRecord(binding).outcome,
      acceptance: "accepted" as const,
      taskIds: [nativeIds[0]],
      receivedAt: receiptTime.toISOString(),
      usage: { cached: false, failed: false, costCents: 0.06, quantity: 1 },
    },
    providerPriceVersion: quote.priceVersion ?? "",
  };
  return { binding, capability, request, catalog, quote, record };
}
export async function pricedMapsFixture(
  includeInternalUnit = false,
  includeHostCounters = false,
  binding = localBindingFixture(),
) {
  const fixture = mapsFixture(binding);
  const clock = { now: () => receiptTime };
  const meter = createMeter({ store: createMemoryStore({ clock, budgets: [] }), clock });
  const request = await PricedRequest.price({
    meter: includeHostCounters
      ? {
          ...meter,
          reserve: (request) =>
            meter.reserve(
              preparePaidAttempt({
                reservation: { ...request, estimateSource: "list" },
                context: {
                  projectId: fixture.binding.target.projectId,
                  connectionId: "connection",
                  publicConnectionId: "conn_synthetic",
                  providerCredentialVersion: "version",
                  correlationId: "maps-test-operation",
                },
              }),
            ),
        }
      : meter,
    catalog: fixture.catalog,
    request: fixture.request,
    expectedOperation:
      fixture.binding.target.surface === "maps"
        ? MAPS_POST_OPERATION
        : "serp.google.local_finder.task_post",
    rejectUnknown: true,
    input: {
      operationId: "maps-test-operation",
      provider: "dataforseo",
      scope: {
        namespace: "test",
        principal: "owner",
        group: fixture.binding.target.projectId,
        connection: "connection",
        providerCredentialVersion: "version",
      },
      fundingSource: "byok",
      costOwner: "owner",
      surface: "app",
      source: "app",
      estimate: includeInternalUnit
        ? [...fixture.quote.quantities, { unit: "units", value: 1n, scale: 0 }]
        : fixture.quote.quantities,
      estimateSource: fixture.quote.source,
      providerPriceVersion: fixture.quote.priceVersion,
    },
  });
  return { ...fixture, priced: request };
}
export function mapsAcceptedEnvelope() {
  return {
    status_code: 20000,
    tasks_count: 1,
    cost: 0.0006,
    tasks: [{ id: nativeIds[0], status_code: 20100, cost: 0.0006, result: null }],
  };
}
/** Synthetic shape based on official task_get advanced docs; not a provider execution receipt. */
export function mapsResultEnvelope() {
  const { request, binding } = mapsFixture();
  const parsed: unknown = JSON.parse(String(request.body));
  const expected: unknown = Array.isArray(parsed) ? parsed[0] : null;
  if (!expected || typeof expected !== "object") throw new Error("Invalid synthetic request.");
  return {
    status_code: 20000,
    tasks_count: 1,
    cost: 0,
    tasks: [
      {
        id: String(nativeIds[0]),
        status_code: 20000,
        cost: 0,
        path: ["v3", "serp", "google", "maps", "task_get", "advanced", nativeIds[0]],
        data: { ...expected, api: "serp", function: "task_get", se: "google", se_type: "maps" },
        result_count: 1,
        result: [
          {
            type: "maps",
            keyword: binding.keyword.text,
            datetime: "2026-10-12 11:58:00 +00:00",
            language_code: "en",
            spell: null,
            items_count: 3,
            items: [
              {
                type: "maps_search",
                rank_group: 1,
                rank_absolute: 1,
                cid: "9007199254740993123",
                place_id: "OpaquePlace_A",
                title: "Synthetic Branch A",
              },
              { type: "maps_paid_item", rank_group: 1, rank_absolute: 2, title: "Synthetic ad" },
              {
                type: "maps_search",
                rank_group: 3,
                rank_absolute: 3,
                cid: "9007199254740993124",
                title: "Synthetic Branch B",
              },
            ],
          },
        ],
      },
    ],
  };
}
