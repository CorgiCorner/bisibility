import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalog, columnId, entry, evidence, input, now } from "./contract-fixtures.test-support";
import {
  createModelPlaygroundRunSchema,
  MODEL_PLAYGROUND_LIMITS,
  modelCatalogSnapshotSchema,
  modelPlaygroundDraftSchema,
  modelPlaygroundLaunchSchema,
} from "./schema";

const outbound = vi.fn(() => {
  throw new Error("Unexpected network call");
});
beforeEach(() => vi.stubGlobal("fetch", outbound));
afterEach(() => {
  expect(outbound).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
const parse = (value: unknown, snapshot = catalog()) =>
  createModelPlaygroundRunSchema([snapshot], now).safeParse(value);

describe("Model Playground strict input", () => {
  it("keeps all four native providers and duplicate cross-provider models independent", () => {
    const providers = ["openai", "anthropic", "openrouter", "vercel_ai_gateway"] as const;
    const protocols = ["responses", "messages", "chat_completions", "chat_completions"] as const;
    const value = input();
    value.columns = providers.map((providerId, index) => ({
      ...value.columns[0],
      providerId,
      columnId: `019a70b2-0000-7000-8000-00000000000${index}`,
    }));
    const catalogs = providers.map((providerId, index) =>
      catalog({
        providerId,
        models: [entry({ providerId, protocol: protocols[index], search: [] })],
      }),
    );
    expect(createModelPlaygroundRunSchema(catalogs, now).parse(value).columns).toEqual(
      value.columns,
    );
  });
  it("round-trips slash-qualified catalog values without changing identity", () => {
    const value = input();
    expect(parse(JSON.parse(JSON.stringify(value))).data).toEqual(value);
    value.columns[0].modelId = "vendor/other";
    expect(parse(value).success).toBe(false);
  });
  it("rejects cross-provider membership and unverified text even if listed", () => {
    const value = input();
    value.columns[0].providerId = "vercel_ai_gateway";
    expect(parse(value).success).toBe(false);
    expect(
      parse(input(), catalog({ models: [entry({ availability: "unavailable" })] })).success,
    ).toBe(false);
    expect(() =>
      parse(
        input(),
        catalog({ models: [entry({ text: { ...evidence, fixtureRevision: null } })] }),
      ),
    ).toThrow();
  });
  it("rejects duplicate column identity while permitting duplicate models", () => {
    const value = input();
    value.columns.push(structuredClone(value.columns[0]));
    expect(parse(value).success).toBe(false);
    value.columns[1].columnId = "019a70b2-0000-7000-8000-000000000002";
    expect(parse(value).success).toBe(true);
    const reversed = { ...value, columns: [...value.columns].reverse() };
    expect(parse(reversed).data?.columns[0].columnId).toBe(value.columns[1].columnId);
  });
  it("accepts six columns and enforces the separate two-inflight policy", () => {
    const value = input();
    value.columns = Array.from({ length: 6 }, (_, index) => ({
      ...value.columns[0],
      columnId: `019a70b2-0000-7000-8000-00000000000${index}`,
    }));
    expect(parse(value).success).toBe(true);
    value.columns.push({ ...value.columns[0], columnId });
    expect(parse(value).success).toBe(false);
    expect(MODEL_PLAYGROUND_LIMITS.inflight).toBe(2);
    expect(parse({ ...input(), inflight: 3 }).success).toBe(false);
  });
  it.each(["apiKey", "endpoint", "tools", "retry", "price"])("rejects unknown input %s", (key) => {
    expect(parse({ ...input(), [key]: "untrusted" }).success).toBe(false);
    const value = input();
    Object.assign(value.columns[0], { [key]: "untrusted" });
    expect(parse(value).success).toBe(false);
    Object.assign(value.columns[0].settings, { [key]: "untrusted" });
    expect(parse(value).success).toBe(false);
  });
  it("preserves the exact Unicode prompt boundary", () => {
    expect(parse({ ...input(), prompt: "😀".repeat(500) }).success).toBe(true);
    const rejected = parse({ ...input(), prompt: "😀".repeat(501) });
    expect(rejected.success).toBe(false);
    if (!rejected.success)
      expect(rejected.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Prompt exceeds 500 characters.",
          "Prompt exceeds 2000 UTF-8 bytes.",
        ]),
      );
    expect(parse({ ...input(), prompt: "\ud800" }).success).toBe(false);
    expect(parse({ ...input(), prompt: "   " }).success).toBe(false);
  });
  it("rejects newline-suffixed locale, payment and quote identifiers", () => {
    expect(parse({ ...input(), responseLanguage: "en\n" }).success).toBe(false);
    const value = input();
    value.columns[0].payment.optionId += "\n";
    expect(parse(value).success).toBe(false);
    expect(
      modelPlaygroundLaunchSchema.safeParse({
        version: 1,
        requestId: columnId,
        previewId: columnId,
        configHash: `${"a".repeat(64)}\n`,
        quoteToken: "opaque",
      }).success,
    ).toBe(false);
  });
  it.each([
    "../secret",
    "vendor/../model",
    "vendor//model",
    "vendor/model\n",
    "https://example.com",
  ])("rejects unsafe model syntax %s", (modelId) => {
    const value = input();
    value.columns[0].modelId = modelId;
    expect(modelPlaygroundDraftSchema.safeParse(value).success).toBe(false);
  });
  it("rejects same-provider connection switching", () => {
    const value = input();
    value.columns.push({
      ...value.columns[0],
      columnId: "019a70b2-0000-7000-8000-000000000002",
      connectionId: "conn_bbbbbbbbbbbbbbbbbbbbbbbb",
    });
    expect(modelPlaygroundDraftSchema.safeParse(value).success).toBe(false);
  });
  it("requires exact search evidence and supported settings", () => {
    const value = input();
    value.columns[0].settings.search = { mode: "openrouter_web_exa", maxCalls: 1 };
    expect(parse(value).success).toBe(true);
    expect(parse(value, catalog({ models: [entry({ search: [] })] })).success).toBe(false);
    expect(
      parse(
        value,
        catalog({
          models: [
            entry({
              search: [{ ...entry().search[0], evidence: { ...evidence, fixtureRevision: null } }],
            }),
          ],
        }),
      ).success,
    ).toBe(false);
    value.columns[0].settings.search.countryCode = "US";
    expect(parse(value).success).toBe(false);
    value.columns[0].settings.search = { mode: "openai_web_search" };
    expect(parse(value).success).toBe(false);
    value.columns[0].settings.search = { mode: "off", maxCalls: 1 };
    expect(parse(value).success).toBe(false);
    value.columns[0].settings.search = { mode: "off" };
    value.columns[0].settings.temperature = 0.3;
    expect(parse(value, catalog({ models: [entry({ temperature: false })] })).success).toBe(false);
    expect(parse(value, catalog({ models: [entry({ maxOutputTokens: 256 })] })).success).toBe(
      false,
    );
  });
  it("refuses stale, future and ambiguous account catalogs", () => {
    expect(parse(input(), catalog({ expiresAt: now.toISOString() })).success).toBe(false);
    expect(parse(input(), catalog({ fetchedAt: "2026-11-11T12:01:00Z" })).success).toBe(false);
    expect(
      createModelPlaygroundRunSchema([catalog(), catalog()], now).safeParse(input()).success,
    ).toBe(false);
  });
  it("validates the server catalog before trusting provider/source/protocol metadata", () => {
    for (const models of [
      [entry(), entry()],
      [entry({ providerId: "anthropic" })],
      [entry({ protocol: "responses" })],
      [entry({ capabilityVersion: "wrong" })],
      [entry({ search: [{ ...entry().search[0], mode: "openai_web_search" }] })],
    ])
      expect(modelCatalogSnapshotSchema.safeParse(catalog({ models })).success).toBe(false);
  });
  it("accepts launch references only, never client-supplied frozen prices or credentials", () => {
    const value = {
      version: 1,
      requestId: columnId,
      previewId: columnId,
      configHash: "a".repeat(64),
      quoteToken: "opaque-accepted-quote",
    };
    expect(modelPlaygroundLaunchSchema.parse(value)).toEqual(value);
    expect(
      modelPlaygroundLaunchSchema.safeParse({ ...value, columns: input().columns }).success,
    ).toBe(false);
  });
});
