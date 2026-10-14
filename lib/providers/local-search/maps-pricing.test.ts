import {
  createDataForSeoMapsModule,
  MAPS_GET_OPERATION,
  MAPS_POST_OPERATION,
  MAPS_PRICE_EXPIRES_AT,
  mapsRequestOptions,
} from "@/lib/provider-rates/dataforseo-maps-module";
import { createCatalog, decimalQuantity } from "@usagekit/providers";
import { describe, expect, it } from "vitest";
import { mapsTaskRequest } from "./maps-capability";
import { sumMapsNative } from "./maps-native-quantity";
import {
  mapsAcceptedEnvelope,
  mapsFixture,
  pricedMapsFixture,
  receiptTime,
} from "./maps-test-fixtures";
import { parseLocalSubmission } from "./submission";

describe("registered source-dated Maps native pricing", () => {
  it("passes descriptor validation and preserves the documented fractional cent through real admission", async () => {
    const f = await pricedMapsFixture();
    expect(f.priced.matched.operation).toMatchObject({ id: MAPS_POST_OPERATION });
    expect(f.priced.admission.outcome).toBe("reserved");
    expect(sumMapsNative([f.priced.estimate])).toEqual([
      { unit: "cents", amount: "0.06" },
      { unit: "requests", amount: "1" },
    ]);
    expect(sumMapsNative(Array.from({ length: 100 }, () => f.priced.estimate))).toEqual([
      { unit: "cents", amount: "6" },
      { unit: "requests", amount: "100" },
    ]);
  });
  it("preserves actual fractional cost and accepted IDs in partial or malformed responses", () => {
    const response = mapsAcceptedEnvelope();
    expect(parseLocalSubmission(response, true, 1, receiptTime).usage.costCents).toBeCloseTo(
      0.06,
      12,
    );
    const partial = parseLocalSubmission(response, false, 2, receiptTime);
    expect(partial.acceptance).toBe("unknown");
    expect(partial.taskIds).toEqual([response.tasks[0].id]);
    expect(partial.usage.costCents).toBeCloseTo(0.06, 12);
    expect(
      sumMapsNative([[decimalQuantity("0.06", "cents")], [decimalQuantity("0.06", "cents")]]),
    ).toEqual([{ unit: "cents", amount: "0.12" }]);
    expect(
      parseLocalSubmission({ ...response, cost: "invalid" }, true, 1, receiptTime).usage.costCents,
    ).toBeNull();
  });
  it("expires new quotes and retains a free exact task-get operation", () => {
    const f = mapsFixture();
    const catalog = createCatalog({
      providers: [createDataForSeoMapsModule(() => new Date(MAPS_PRICE_EXPIRES_AT))],
      enabled: ["dataforseo"],
      now: () => receiptTime,
    });
    const match = catalog.match("dataforseo", f.request);
    if (match.operation === "unknown") throw new Error("Missing Maps operation.");
    expect(
      catalog.estimate(
        { id: "connection", provider: "dataforseo", fundingSource: "byok" },
        match.operation.id,
        match.options,
      ).source,
    ).toBe("unknown");
    const get = f.catalog.match("dataforseo", {
      method: "GET",
      url: "https://api.dataforseo.com/v3/serp/google/maps/task_get/advanced/11111111-1111-1111-1111-111111111111",
    });
    expect(get.operation).toMatchObject({ id: MAPS_GET_OPERATION, billable: false });
  });
  it.each([
    { priority: 2 },
    { depth: 100 },
    { calculate_rectangles: true },
    { search_places: true },
    { device: "mobile", os: "windows" },
    { keyword: "site:example.test" },
    { keyword: "site%3Aexample.test" },
    { location_coordinate: "91,21,14z" },
    { language_code: "xx" },
  ])("fails closed for unsupported paid or scope options %j", (changes) => {
    const f = mapsFixture();
    const body: unknown = JSON.parse(String(f.request.body));
    const row = Array.isArray(body) ? body[0] : null;
    expect(mapsRequestOptions({ ...f.request, body: [{ ...row, ...changes }] })).toEqual({
      pricingUnknown: "true",
    });
  });
  it("keeps original public organic pricing and rejects unsupported Finder capability", () => {
    const f = mapsFixture();
    expect(
      f.catalog.match("dataforseo", {
        method: "POST",
        url: "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
        body: [{ keyword: "synthetic", depth: 100 }],
      }).operation,
    ).toMatchObject({ id: "serp.google.organic.live.advanced" });
    expect(() =>
      mapsTaskRequest({
        ...f.binding,
        target: {
          ...f.binding.target,
          surface: "local_finder",
          resultKind: "listing",
          rankScale: "finder_organic",
        },
      }),
    ).toThrow("Unsupported");
  });
});
