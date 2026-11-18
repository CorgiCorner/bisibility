import { input } from "@/lib/model-playground/contract-fixtures.test-support";
import { describe, expect, it } from "vitest";
import {
  modelPlaygroundCreateSchema,
  modelPlaygroundPreviewInputSchema,
} from "./model-playground-schemas";
import { defaultModelPlaygroundService } from "./model-playground-service";

describe("Model Playground REST contract", () => {
  it("accepts the four native own-key providers and their routing settings", () => {
    for (const providerId of ["openai", "anthropic", "openrouter", "vercel_ai_gateway"]) {
      const draft = input();
      Object.assign(draft.columns[0], { providerId });
      if (providerId === "anthropic") draft.columns[0].settings.workspaceId = "wrkspc_abc";
      if (providerId === "vercel_ai_gateway")
        draft.columns[0].settings.allowedProviders = ["openai"];
      expect(modelPlaygroundPreviewInputSchema.safeParse(draft).success).toBe(true);
    }
  });
  it.each(["dataforseo", "credits", "hosted", "consumer", "other"])("rejects %s", (providerId) => {
    const draft = input();
    Object.assign(draft.columns[0], { providerId });
    expect(modelPlaygroundPreviewInputSchema.safeParse(draft).success).toBe(false);
  });
  it("rejects forged prices, direct credentials, unknown fields and body projects", () => {
    for (const patch of [
      { price: 0 },
      { endpoint: "https://example.com" },
      { apiKey: "fixture" },
      { projectId: "other" },
      { wallet: {} },
      { fundingBridge: {} },
    ]) {
      expect(modelPlaygroundPreviewInputSchema.safeParse({ ...input(), ...patch }).success).toBe(
        false,
      );
      const draft = input();
      Object.assign(draft.columns[0], patch);
      expect(modelPlaygroundPreviewInputSchema.safeParse(draft).success).toBe(false);
    }
    const draft = input();
    Object.assign(draft.columns[0].payment, { fundingSource: "platform" });
    expect(modelPlaygroundPreviewInputSchema.safeParse(draft).success).toBe(false);
  });
  it("requires consent and only accepts the server confirmation shape", () => {
    const request = {
      version: 1,
      quoteId: "019a70b2-0000-7000-8000-000000000001",
      consent: "non_guaranteed_estimate_v1",
    };
    expect(modelPlaygroundCreateSchema.safeParse(request).success).toBe(true);
    expect(modelPlaygroundCreateSchema.safeParse({ ...request, consent: undefined }).success).toBe(
      false,
    );
    expect(
      modelPlaygroundCreateSchema.safeParse({ ...request, confirmUnknown: { nonce: "x" } }).success,
    ).toBe(false);
  });
  it("retains a typed unavailable fallback without work", async () => {
    const service = defaultModelPlaygroundService;
    expect(service.enabled).toBe(false);
    expect(Object.isFrozen(service)).toBe(true);
    expect(await service.checkConnection({} as never, {} as never)).toEqual({
      kind: "not_available_yet",
    });
    expect(await service.catalog({} as never, {} as never)).toEqual({ kind: "not_available_yet" });
    expect(await service.preview({} as never, input())).toEqual({ kind: "not_available_yet" });
    expect(await service.create({} as never, {} as never, "key")).toEqual({
      kind: "not_available_yet",
    });
    expect(await service.read({} as never, "run")).toEqual({ kind: "not_available_yet" });
  });
});
