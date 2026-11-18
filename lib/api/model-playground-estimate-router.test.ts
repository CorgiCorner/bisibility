import { input } from "@/lib/model-playground/contract-fixtures.test-support";
import { describe, expect, it } from "vitest";
import { MODEL_PLAYGROUND_ESTIMATE_LIMIT } from "./model-playground-estimate-limit";
import {
  auth,
  createBody,
  mocks,
  projectId,
  quoteId,
  request,
} from "./model-playground-router.test-helpers";

const readOnly = { ...auth, apiKey: { ...auth.apiKey, scopes: ["read"] } };
const writeOnlyFields = ["quote_id", "preview_id", "quote_token", "expires_at", "config_hash"];

describe("Model Playground read estimate route", () => {
  it("gives a read key forecasts without binding fields", async () => {
    const response = await request("POST", "runs/estimate", input(), undefined, readOnly);
    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    expect(data.forecasts).toHaveLength(1);
    expect(data.estimated_at).toBeTruthy();
    expect(data.budget_available).toBe(true);
    for (const field of writeOnlyFields) expect(data).not.toHaveProperty(field);
    expect(JSON.stringify(data)).not.toContain(quoteId);
    expect(mocks.service.estimate).toHaveBeenCalledOnce();
    expect(mocks.service.estimate.mock.calls[0][0]).toMatchObject({
      projectId: "project-internal",
      projectPublicId: projectId,
      credential: { id: "fixture-api-key", kind: "project_key" },
    });
    expect(mocks.service.preview).not.toHaveBeenCalled();
    expect(mocks.service.create).not.toHaveBeenCalled();
  });
  it("keeps preview and create on write scope", async () => {
    expect((await request("POST", "runs/preview", input(), undefined, readOnly)).status).toBe(403);
    expect((await request("POST", "runs", createBody, "key", readOnly)).status).toBe(403);
    expect(mocks.service.preview).not.toHaveBeenCalled();
    expect(mocks.service.create).not.toHaveBeenCalled();
  });
  it("rejects a service result that carries a binding field", async () => {
    mocks.service.estimate.mockResolvedValueOnce({
      version: 1,
      estimatedAt: "2026-11-13T12:00:00Z",
      budgetAvailable: true,
      quoteId,
      forecasts: [],
    });
    expect((await request("POST", "runs/estimate", input(), undefined, readOnly)).status).toBe(500);
  });
  it("ignores an Idempotency-Key, so nothing is cached for replay", async () => {
    const first = await request("POST", "runs/estimate", input(), "same-key", readOnly);
    const second = await request("POST", "runs/estimate", input(), "same-key", readOnly);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.headers.get("Idempotency-Replayed")).toBeNull();
    expect(mocks.service.estimate).toHaveBeenCalledTimes(2);
  });
  it("refuses a missing connection before estimating", async () => {
    mocks.service.checkConnection.mockResolvedValue({ kind: "not_found" });
    expect((await request("POST", "runs/estimate", input(), undefined, readOnly)).status).toBe(404);
    expect(mocks.service.estimate).not.toHaveBeenCalled();
  });
  it("returns 429 with Retry-After after the per-credential estimate limit", async () => {
    for (let i = 0; i < MODEL_PLAYGROUND_ESTIMATE_LIMIT; i++)
      expect((await request("POST", "runs/estimate", input(), undefined, readOnly)).status).toBe(
        200,
      );
    const limited = await request("POST", "runs/estimate", input(), undefined, readOnly);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(mocks.service.estimate).toHaveBeenCalledTimes(MODEL_PLAYGROUND_ESTIMATE_LIMIT);
    // Preview has its own bucket; the estimate limit does not affect it.
    expect((await request("POST", "runs/preview", input())).status).toBe(200);
  });
});
