import { input, unknownMoney } from "@/lib/model-playground/contract-fixtures.test-support";
import { describe, expect, it, vi } from "vitest";
import {
  admitted,
  attemptId,
  auth,
  createBody,
  mocks,
  projectId,
  quoteId,
  request,
  runId,
} from "./model-playground-router.test-helpers";
import { snakeizeKeys } from "./surface";

vi.mock("./router", async (original) =>
  (await import("./response-capture.test-support")).captureRouter(await original()),
);

describe("Model Playground router", () => {
  it("loads catalog and previews through scoped free members only", async () => {
    const response = await request(
      "GET",
      `catalog?provider_id=openrouter&connection_id=${input().columns[0].connectionId}`,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).not.toHaveProperty("account_digest");
    const preview = await request("POST", "runs/preview", input());
    expect(preview.status).toBe(200);
    expect((await preview.json()).data.forecasts[0].money).toEqual(snakeizeKeys(unknownMoney));
    expect(mocks.service.preview.mock.calls[0][0]).toMatchObject({
      projectId: "project-internal",
      projectPublicId: projectId,
      actor: { id: "fixture-owner" },
      credential: { id: "fixture-api-key", kind: "project_key" },
    });
    expect(mocks.service.create).not.toHaveBeenCalled();
    const estimate = await request("POST", "runs/estimate", input(), undefined, {
      ...auth,
      apiKey: { ...auth.apiKey, scopes: ["read"] },
    });
    expect(estimate.status).toBe(200);
    expect((await estimate.json()).data).not.toHaveProperty("quote_id");
  });
  it("denies authorization before parsing or resolving a connection", async () => {
    const denied = await request("POST", "runs", { invalid: true }, "key", {
      ...auth,
      apiKey: { ...auth.apiKey, scopes: ["read"] },
    });
    expect(denied.status).toBe(403);
    const foreign = await request("POST", "runs/preview", input(), undefined, {
      ...auth,
      project: { ...auth.project, publicId: "prj_b00000000000000000000000" },
    });
    expect(foreign.status).toBe(403);
    expect(mocks.service.checkConnection).not.toHaveBeenCalled();
    expect(mocks.service.create).not.toHaveBeenCalled();
  });
  it("rejects a body project mismatch and unknown fields before service work", async () => {
    for (const body of [
      { ...input(), projectId: "prj_b00000000000000000000000" },
      { ...input(), price: 0 },
    ]) {
      const response = await request("POST", "runs/preview", body);
      expect(response.status).toBe(400);
      expect((await response.json()).type).toContain("validation_failed");
    }
    expect(mocks.service.checkConnection).not.toHaveBeenCalled();
  });
  it("refuses a wrong-project connection as not found before quoting", async () => {
    mocks.service.checkConnection.mockResolvedValue({ kind: "not_found" });
    expect((await request("POST", "runs/preview", input())).status).toBe(404);
    expect(mocks.service.preview).not.toHaveBeenCalled();
  });
  it("requires an idempotency key and replays admitted creates without another call", async () => {
    expect((await request("POST", "runs", createBody)).status).toBe(400);
    expect(mocks.service.create).not.toHaveBeenCalled();
    const first = await request("POST", "runs", createBody, "same-quote");
    const replay = await request("POST", "runs", createBody, "same-quote");
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(await replay.json());
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
    expect(mocks.service.create).toHaveBeenCalledOnce();
    expect(mocks.service.create.mock.calls[0].slice(1)).toEqual([createBody, "same-quote"]);
  });
  it("coalesces concurrent creates while the first admission is pending", async () => {
    let release!: (value: typeof admitted) => void;
    let started!: () => void;
    const entered = new Promise<void>((done) => {
      started = done;
    });
    mocks.service.create.mockImplementationOnce(() => {
      started();
      return new Promise((done) => {
        release = done;
      });
    });
    const first = request("POST", "runs", createBody, "concurrent");
    await entered;
    const second = request("POST", "runs", createBody, "concurrent");
    release(admitted);
    const responses = await Promise.all([first, second]);
    expect(responses.map((v) => v.status)).toEqual([200, 200]);
    expect(mocks.service.create).toHaveBeenCalledOnce();
  });
  it("preserves confirmation and definite refusal outcomes", async () => {
    const confirmation = {
      kind: "confirmation_required",
      nonce: quoteId,
      contentHash: "a".repeat(64),
      attemptIds: [attemptId],
      earlierAttemptUnconfirmed: true,
    };
    mocks.service.create.mockResolvedValueOnce(confirmation);
    expect((await (await request("POST", "runs", createBody, "confirmation")).json()).data).toEqual(
      snakeizeKeys(confirmation),
    );
    const refused = { kind: "not_dispatched", reason: "quote_expired", quoteInvalidated: true };
    mocks.service.create.mockResolvedValueOnce(refused);
    expect((await (await request("POST", "runs", createBody, "refused")).json()).data).toEqual(
      snakeizeKeys(refused),
    );
  });
  it("never labels an uncertain server error or malformed admission as not dispatched", async () => {
    for (const mode of ["throw", "bad-result"]) {
      if (mode === "throw")
        mocks.service.create.mockRejectedValueOnce(new Error("uncertain after commit"));
      else mocks.service.create.mockResolvedValueOnce({ ...admitted, attempts: null });
      const response = await request("POST", "runs", createBody, mode);
      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain("not_dispatched");
    }
  });
  it("reads retained provenance without calling preview or create", async () => {
    const response = await request("GET", `runs/${runId}`);
    expect(response.status).toBe(200);
    expect((await response.json()).data.columns[0].result).toMatchObject({
      provider_cost: snakeizeKeys(unknownMoney),
      consulted_sources: { total: null },
      citation_totals: { total: 2 },
      cost_evidence: { provider_reported: null },
      routing_attempt_credentials: { completeness: "unknown" },
    });
    expect(mocks.service.preview).not.toHaveBeenCalled();
    expect(mocks.service.create).not.toHaveBeenCalled();
    expect(mocks.service.checkConnection).not.toHaveBeenCalled();
    expect((await request("GET", "runs/not-a-uuid")).status).toBe(400);
    mocks.service.read.mockResolvedValueOnce({ kind: "not_found" });
    expect((await request("GET", `runs/${runId}`)).status).toBe(404);
  });
  it("maps the default binding to a typed 503 without claiming dispatch", async () => {
    mocks.service.create.mockResolvedValueOnce({ kind: "not_available_yet" });
    const response = await request("POST", "runs", createBody, "unwired");
    expect(response.status).toBe(503);
    expect((await response.json()).details).toEqual({
      reason: "not_available_yet",
      retryable: false,
    });
  });
});
