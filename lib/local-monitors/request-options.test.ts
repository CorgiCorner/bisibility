import { signMonitorConsent, verifyMonitorConsent } from "@/lib/local-monitor-launch/consent";
import {
  assertMonitorDefinition,
  buildMonitorDefinition,
} from "@/lib/local-monitor-store/definition";
import { definitionInputSchema } from "@/lib/local-monitor-store/definition-schema";
import { monitorDefinitionFixture, monitorKeywordFixture } from "@/lib/local-monitor-store/fixture";
import { createMonitorSchema, reviseMonitorSchema } from "@/lib/local-monitor-store/schema";
import { assertLocalCapability } from "@/lib/local-monitoring/capability";
import { MAPS_REQUEST_SCOPE } from "@/lib/local-monitoring/maps-request-scope";
import {
  assertFrozenQuoteSelection,
  type LocalQuote,
  localQuoteHash,
} from "@/lib/local-monitoring/quote";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import { createMapsAdapter } from "@/lib/providers/local-search/maps-adapter";
import { mapsCapability } from "@/lib/providers/local-search/maps-capability";
import {
  localBindingFixture,
  quoteFixture,
  receiptTime,
} from "@/lib/providers/local-search/test-fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { monitorFormSchema } from "./form-model";

beforeEach(() => {
  process.env.BISIBILITY_SECRETS_KEY = Buffer.alloc(32, 9).toString("base64");
});
afterEach(() => {
  delete process.env.BISIBILITY_SECRETS_KEY;
});
const definition = {
  ...monitorDefinitionFixture,
  axes: {
    ...monitorDefinitionFixture.axes,
    device: "mobile" as const,
    operatingSystem: "ios",
    zoom: 21,
  },
};
const baseCommand = { projectId: "prj_abcdefghijklmnopqrstuvwx", idempotencyKey: "explicit-save" };
describe("Maps form, server, request and consent dimensions", () => {
  it.each([
    { operatingSystem: null },
    { operatingSystem: "windows" },
    { operatingSystem: "linux" },
    { zoom: null },
    { zoom: 2 },
    { zoom: 22 },
    { zoom: 3.5 },
    { cutoff: 21 },
    { language: "pl" },
  ])("rejects unsupported new Maps axes %j on the client and both write commands", (axes) => {
    const invalid = { ...definition, axes: { ...definition.axes, ...axes } };
    expect(monitorFormSchema.safeParse(invalid).success).toBe(false);
    expect(createMonitorSchema.safeParse({ ...baseCommand, definition: invalid }).success).toBe(
      false,
    );
    expect(
      reviseMonitorSchema.safeParse({
        ...baseCommand,
        monitorId: "lmn_abcdefghijklmnopqrstuvwx",
        expectedVersion: 1,
        definition: invalid,
      }).success,
    ).toBe(false);
  });
  it("still verifies nullable retained definitions without upgrading their support or identity", () => {
    const legacy = {
      ...monitorDefinitionFixture,
      axes: { ...monitorDefinitionFixture.axes, operatingSystem: null, zoom: null },
    };
    expect(definitionInputSchema.safeParse(legacy).success).toBe(true);
    const stored = buildMonitorDefinition(legacy, {
      entityId: "entity",
      revisionId: "retained-revision",
      keywords: [monitorKeywordFixture],
    });
    expect(assertMonitorDefinition(stored)).toEqual(stored);
    expect(stored.axes).toMatchObject({ operatingSystem: null, zoom: null });
    expect(monitorFormSchema.safeParse(legacy).success).toBe(false);
  });
  it.each([
    ["desktop", "windows", 3],
    ["desktop", "macos", 21],
    ["mobile", "android", 3],
    ["mobile", "ios", 21],
  ] as const)(
    "roundtrips %s/%s at zoom %s through the actual credential-free adapter request",
    async (device, os, zoom) => {
      const saved = createMonitorSchema.parse({
        ...baseCommand,
        definition: {
          ...definition,
          axes: { ...definition.axes, device, operatingSystem: os, zoom },
        },
      }).definition;
      const original = localBindingFixture();
      const binding = { ...original, target: { ...original.target, ...saved.axes } };
      const capability = mapsCapability(receiptTime);
      expect(capability.implementations[0].zoomRange).toEqual(MAPS_REQUEST_SCOPE.zoomRange);
      assertLocalCapability(binding.target, capability, receiptTime);
      const io = vi.fn(async (): Promise<never> => {
        throw new Error("No transport in request fixture");
      });
      const adapter = createMapsAdapter({
        binding,
        capability,
        providerPriceVersion: "synthetic-price",
        ports: {
          clock: () => receiptTime,
          assertPreparedBinding: io,
          assertPreparedQuote: io,
          submitPrepared: io,
          assertDurableDispatchEvidence: io,
          assertRetrieval: io,
          retrieveEnvelope: io,
        },
      });
      const quote = {
        ...quoteFixture(binding),
        capabilityVersion: capability.version,
        providerPriceVersion: "synthetic-price",
        effectiveOptions: { device, operatingSystem: os, cutoff: "20", zoom: String(zoom) },
      };
      assertFrozenQuoteSelection(quote, [binding.target]);
      const request = await adapter.buildRequest({ ...binding, quote });
      expect(JSON.parse(String(request.body))[0]).toMatchObject({
        device,
        os,
        location_coordinate: `52.2297000,21.0122000,${zoom}z`,
        depth: 20,
      });
      expect(io).not.toHaveBeenCalled();
    },
  );
  it("binds OS/zoom and revision to the frozen quote and requires fresh consent after either changes", () => {
    const binding = localBindingFixture();
    const target = { ...binding.target, ...monitorFormSchema.parse(definition).axes };
    const quote: LocalQuote = {
      version: 1,
      projectId: target.projectId,
      expectedTargetKeys: [executionTargetKey(target)],
      effectiveOptions: {
        device: target.device,
        operatingSystem: String(target.operatingSystem),
        zoom: String(target.zoom),
      },
      capabilityVersion: mapsCapability(receiptTime).version,
      provider: "dataforseo",
      adapterVersion: "adapter",
      providerPriceVersion: "synthetic-price",
      nativeEstimates: [{ unit: "cents", amount: "0.06" }],
      issuedAt: receiptTime.toISOString(),
      expiresAt: new Date(receiptTime.getTime() + 120000).toISOString(),
    };
    const consent = {
      actorId: "actor",
      projectId: target.projectId,
      monitorId: "monitor",
      monitorVersion: 1,
      revisionId: "revision",
      scheduleIntentId: "intent",
      connectionId: "connection",
      connectionStamp: "stamp",
      targetIds: ["target"],
      idempotencyKey: "launch",
      quote,
    };
    const signed = signMonitorConsent(consent, receiptTime);
    expect(() => assertFrozenQuoteSelection(quote, [target])).not.toThrow();
    expect(() => verifyMonitorConsent(signed.token, consent, receiptTime)).not.toThrow();
    for (const changed of [
      { ...target, operatingSystem: "android" },
      { ...target, zoom: 20 },
    ]) {
      expect(() => assertFrozenQuoteSelection(quote, [changed])).toThrow();
      const changedQuote = {
        ...quote,
        expectedTargetKeys: [executionTargetKey(changed)],
        effectiveOptions: {
          ...quote.effectiveOptions,
          operatingSystem: String(changed.operatingSystem),
          zoom: String(changed.zoom),
        },
      };
      expect(localQuoteHash(changedQuote)).not.toBe(localQuoteHash(quote));
      expect(() =>
        verifyMonitorConsent(signed.token, { ...consent, quote: changedQuote }, receiptTime),
      ).toThrow("mismatch");
    }
    expect(() =>
      verifyMonitorConsent(
        signed.token,
        { ...consent, monitorVersion: 2, revisionId: "revised" },
        receiptTime,
      ),
    ).toThrow("mismatch");
    const revised = { ...consent, monitorVersion: 2, revisionId: "revised" };
    expect(() =>
      verifyMonitorConsent(signMonitorConsent(revised, receiptTime).token, revised, receiptTime),
    ).not.toThrow();
  });
});
