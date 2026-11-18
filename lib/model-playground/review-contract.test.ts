import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  catalog,
  entry,
  evidence,
  input,
  now,
  preview,
  result,
} from "./contract-fixtures.test-support";
import {
  createModelPlaygroundRunSchema,
  modelCatalogSnapshotSchema,
  modelColumnSchema,
  modelPlaygroundDraftSchema,
} from "./schema";
import { modelColumnResultSchema, serializeModelPlaygroundReport } from "./types";

const outbound = vi.fn(() => {
  throw new Error("Unexpected network call");
});
beforeEach(() => vi.stubGlobal("fetch", outbound));
afterEach(() => {
  expect(outbound).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("native BYOK scope (B1)", () => {
  it.each([
    ["dataforseo", "raw_model", "byok"],
    ["dataforseo", "raw_model", "platform"],
    ["dataforseo", "consumer_capture", "byok"],
    ["openrouter", "raw_model", "platform"],
    ["openrouter", "consumer_capture", "byok"],
  ])(
    "rejects %s / %s / %s with matching synthetic metadata",
    (providerId, sourceKind, fundingSource) => {
      const value = input();
      Object.assign(value.columns[0], { providerId, sourceKind });
      Object.assign(value.columns[0].payment, { fundingSource });
      const snapshot = catalog();
      Object.assign(snapshot, { providerId });
      Object.assign(snapshot.models[0], {
        providerId,
        sourceKind,
        protocol: providerId === "dataforseo" ? "dataforseo" : "chat_completions",
        search: [],
      });
      expect(modelColumnSchema.safeParse(value.columns[0]).success).toBe(false);
      expect(modelPlaygroundDraftSchema.safeParse(value).success).toBe(false);
      if (providerId === "dataforseo" || sourceKind === "consumer_capture") {
        expect(modelCatalogSnapshotSchema.safeParse(snapshot).success).toBe(false);
        expect(() => createModelPlaygroundRunSchema([snapshot], now)).toThrow(z.ZodError);
      } else {
        expect(createModelPlaygroundRunSchema([snapshot], now).safeParse(value).success).toBe(
          false,
        );
      }
    },
  );

  it("rejects obsolete protocol and search branches on native catalogs and drafts", () => {
    const snapshot = catalog();
    Object.assign(snapshot.models[0], { protocol: "dataforseo" });
    expect(modelCatalogSnapshotSchema.safeParse(snapshot).success).toBe(false);
    const value = input();
    Object.assign(value.columns[0].settings.search, { mode: "dataforseo_web_search" });
    expect(modelPlaygroundDraftSchema.safeParse(value).success).toBe(false);
    Object.assign(snapshot.models[0], {
      protocol: "chat_completions",
      search: [{ ...entry().search[0], mode: "dataforseo_web_search" }],
    });
    expect(modelCatalogSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
});

describe("retained source identity (S1)", () => {
  it("rejects conflicting URLs for one source ID at result and report boundaries", () => {
    const value = result();
    value.citations[1].url = "https://example.org/another-source";
    expect(modelColumnResultSchema.safeParse(value).success).toBe(false);
    expect(() => serializeModelPlaygroundReport([value], preview())).toThrow(z.ZodError);
  });

  it("preserves distinct occurrences of a single source and varying titles", () => {
    const value = result();
    value.citations[1].title = "Another title for the same source";
    expect(modelColumnResultSchema.parse(value).citations).toEqual(value.citations);
    const serialized = serializeModelPlaygroundReport([value], preview());
    const retained = modelColumnResultSchema.parse(JSON.parse(serialized.body).columns[0]);
    expect(retained.citations).toEqual(value.citations);
    expect(new Set(retained.citations.map((item) => item.sourceId)).size).toBe(1);
    expect(new Set(retained.citations.map((item) => item.occurrenceId)).size).toBe(2);
    value.citations[1].occurrenceId = value.citations[0].occurrenceId;
    expect(modelColumnResultSchema.safeParse(value).success).toBe(false);
  });

  it("scopes source identity to each column", () => {
    const first = result();
    const second = result();
    second.column.columnId = "019a70b2-0000-7000-8000-000000000002";
    for (const item of second.citations) item.url = "https://example.org/another-source";
    const frozen = preview();
    frozen.input.columns.push(second.column);
    frozen.columns.push({ ...frozen.columns[0], columnId: second.column.columnId });
    expect(
      JSON.parse(serializeModelPlaygroundReport([first, second], frozen).body).columns,
    ).toEqual([first, second]);
  });
});

describe("actual upstream identity (S2)", () => {
  it.each(["openrouter", "vercel_ai_gateway"] as const)(
    "round-trips upstreams and explicit unknown for %s",
    (gateway) => {
      const values = ["upstream-a", "upstream-b", null].map((actualProviderId, index) => {
        const value = Object.assign(result(), { actualProviderId });
        value.column.providerId = gateway;
        value.column.columnId = `019a70b2-0000-7000-8000-00000000000${index}`;
        value.actualModelId = "vendor/actual-model";
        return value;
      });
      const frozen = preview();
      frozen.input.columns = values.map((value) => value.column);
      frozen.columns = values.map((value) => ({
        ...frozen.columns[0],
        columnId: value.column.columnId,
      }));
      const serialized = serializeModelPlaygroundReport(values, frozen);
      const retained = z.array(modelColumnResultSchema).parse(JSON.parse(serialized.body).columns);
      expect(retained).toEqual(values);
      expect(retained.map((value) => value.actualProviderId)).toEqual([
        "upstream-a",
        "upstream-b",
        null,
      ]);
      expect(
        retained.every(
          (value) =>
            value.column.providerId === gateway && value.actualModelId === "vendor/actual-model",
        ),
      ).toBe(true);
      expect(retained.every((value) => value.providerCost.certainty === "unknown")).toBe(true);
    },
  );

  it("requires explicit null or a bounded upstream identifier, without routing blobs", () => {
    const value = Object.assign(result(), { actualProviderId: "a".repeat(256) });
    expect(modelColumnResultSchema.safeParse(value).success).toBe(true);
    for (const actualProviderId of [
      undefined,
      "",
      "a".repeat(257),
      "provider\n",
      { route: "upstream-a" },
    ])
      expect(modelColumnResultSchema.safeParse({ ...value, actualProviderId }).success).toBe(false);
    expect(
      modelColumnResultSchema.safeParse({ ...value, routing: { provider: "upstream-a" } }).success,
    ).toBe(false);
  });
});

describe("catalog cache boundary (N1)", () => {
  it.each(["text", "search"])("requires bounded safe HTTPS %s evidence URLs", (target) => {
    const snapshot = catalog();
    snapshot.models[0].text = { ...snapshot.models[0].text };
    snapshot.models[0].search[0].evidence = { ...snapshot.models[0].search[0].evidence };
    const setUrl = (documentationUrl: string) => {
      if (target === "text") snapshot.models[0].text.documentationUrl = documentationUrl;
      else snapshot.models[0].search[0].evidence.documentationUrl = documentationUrl;
    };
    const prefix = "https://example.org/";
    setUrl(prefix + "a".repeat(2048 - prefix.length));
    expect(modelCatalogSnapshotSchema.safeParse(snapshot).success).toBe(true);
    for (const url of [
      prefix + "a".repeat(2049 - prefix.length),
      prefix + "a".repeat(65536),
      "javascript:alert(1)",
      "http://example.org/docs",
      "https://user:pass@example.com/docs",
      "not a URL",
    ]) {
      setUrl(url);
      expect(modelCatalogSnapshotSchema.safeParse(snapshot).success, url).toBe(false);
      expect(() => createModelPlaygroundRunSchema([snapshot], now)).toThrow(z.ZodError);
    }
  });

  it("caps total serialized catalog UTF-8 bytes at 1 MiB including JSON overhead", () => {
    const snapshot = catalog({
      models: Array.from({ length: 1000 }, (_, index) =>
        entry({ modelId: `vendor/model-${index}`, search: [], text: { ...evidence } }),
      ),
    });
    expect(modelCatalogSnapshotSchema.safeParse(snapshot).success).toBe(true);
    const limit = 1024 * 1024;
    let remaining = limit - new TextEncoder().encode(JSON.stringify(snapshot)).length;
    for (const model of snapshot.models) {
      const count = Math.min(remaining, 2048 - model.text.documentationUrl.length);
      model.text.documentationUrl += "a".repeat(count);
      remaining -= count;
    }
    expect(remaining).toBe(0);
    expect(modelCatalogSnapshotSchema.safeParse(snapshot).success).toBe(true);
    snapshot.models[999].text.documentationUrl += "a";
    expect(modelCatalogSnapshotSchema.safeParse(snapshot).success).toBe(false);
    expect(() => createModelPlaygroundRunSchema([snapshot], now)).toThrow(z.ZodError);
    snapshot.models[999].text.documentationUrl = `${evidence.documentationUrl}😀`;
    snapshot.models[0].text.documentationUrl = snapshot.models[0].text.documentationUrl.slice(
      0,
      -2,
    );
    expect(JSON.stringify(snapshot).length).toBe(limit);
    expect(modelCatalogSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
});
