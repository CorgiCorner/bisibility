import { input, result } from "@/lib/model-playground/contract-fixtures.test-support";
import { modelMoneySchema } from "@/lib/providers/model/transport-contract";
import { describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import { IDEMPOTENCY_BODY_BYTES } from "./idempotency";
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
import { apiRequestOrigin } from "./request-origin";
import { handleMcpPreauthenticatedApiRequest } from "./router";

vi.mock("./router", async (original) =>
  (await import("./response-capture.test-support")).captureRouter(await original()),
);

const confirmation = {
  kind: "confirmation_required",
  nonce: quoteId,
  contentHash: "a".repeat(64),
  attemptIds: [attemptId],
  earlierAttemptUnconfirmed: true,
};
const { kind: _kind, earlierAttemptUnconfirmed: _earlier, ...confirmUnknown } = confirmation;

describe("reviewed REST transitions", () => {
  it.each([
    { key: "initial", confirmed: false, expected: "confirmation_required", status: 200, calls: 1 },
    { key: "initial", confirmed: true, expected: null, status: 422, calls: 1 },
    { key: "nonce-bound-new", confirmed: true, expected: "admitted", status: 200, calls: 2 },
  ])("replays or confirms according to key and nonce: $key/$confirmed", async (transition) => {
    mocks.service.create.mockResolvedValueOnce(confirmation).mockResolvedValue(admitted);
    expect((await request("POST", "runs", createBody, "initial")).status).toBe(200);
    const body = transition.confirmed ? { ...createBody, confirmUnknown } : createBody;
    const response = await request("POST", "runs", body, transition.key);
    expect(response.status).toBe(transition.status);
    const wire = await response.json();
    if (transition.expected) expect(wire.data.kind).toBe(transition.expected);
    else {
      expect(wire.type).toContain("validation_failed");
      expect(wire.instance).toBe(
        `urn:bisibility:api:v1:/api/v1/projects/${projectId}/model-playground/runs`,
      );
    }
    expect(mocks.service.create).toHaveBeenCalledTimes(transition.calls);
    if (transition.calls === 2) {
      expect(mocks.service.create.mock.calls[1].slice(1)).toEqual([body, transition.key]);
      expect(response.headers.get("Idempotency-Replayed")).toBeNull();
    } else
      expect(response.headers.get("Idempotency-Replayed")).toBe(
        transition.expected ? "true" : null,
      );
  });
  it.each([undefined, { kind: "needs_reauth" }])(
    "refuses malformed readiness: %j",
    async (result) => {
      mocks.service.checkConnection.mockResolvedValue(result);
      const catalog = await request(
        "GET",
        `catalog?provider_id=openrouter&connection_id=${input().columns[0].connectionId}`,
      );
      const preview = await request("POST", "runs/preview", input());
      expect([catalog.status, preview.status]).toEqual([500, 500]);
      expect(mocks.service.catalog).not.toHaveBeenCalled();
      expect(mocks.service.preview).not.toHaveBeenCalled();
    },
  );
  it.each(["projectId", "runId"] as const)(
    "refuses another %s before returning data",
    async (field) => {
      const control = await request("GET", `runs/${runId}`);
      expect(control.status).toBe(200);
      const wire = (await control.json()).data;
      mocks.service.read.mockResolvedValueOnce({
        ...(await mocks.service.read.mock.results[0].value),
        [field]: field === "projectId" ? "prj_b00000000000000000000000" : quoteId,
      });
      const response = await request("GET", `runs/${runId}`);
      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain(wire.prompt);
      expect(mocks.service.create).not.toHaveBeenCalled();
    },
  );
  it("requires explicit activation before any service member", async () => {
    Object.assign(mocks.service, { enabled: false });
    for (const [method, tail, body] of [
      [
        "GET",
        `catalog?provider_id=openrouter&connection_id=${input().columns[0].connectionId}`,
        undefined,
      ],
      ["POST", "runs/preview", input()],
      ["POST", "runs", createBody],
      ["GET", `runs/${runId}`, undefined],
    ] as const) {
      const response = await request(method, tail, body, "disabled");
      expect(response.status).toBe(503);
      expect((await response.json()).details).toMatchObject({
        reason: "not_available_yet",
        retryable: false,
      });
    }
    for (const member of ["checkConnection", "catalog", "preview", "create", "read"] as const)
      expect(mocks.service[member]).not.toHaveBeenCalled();
  });
  it.each([
    ["GET", "anything"],
    ["GET", "catalog/extra"],
    ["POST", "catalog"],
    ["POST", "runs/preview/extra"],
    ["GET", `runs/${runId}/extra`],
  ])("keeps disabled unknown route %s %s as 404", async (method, tail) => {
    mocks.service.enabled = false;
    const { modelPlaygroundRoute } = await import("./model-playground");
    expect((await request(method, tail)).status).toBe(404);
    const url = new URL(
      `https://example.com/api/v1/projects/${projectId}/model-playground/${tail}`,
    );
    const directAuth = {
      ...auth,
      apiKey: {
        ...auth.apiKey,
        name: "Fixture",
        prefix: "bsb_key_fixture",
        scopes: ["read", "write"] as const,
      },
      project: {
        ...auth.project,
        name: "Fixture",
        domain: "example.com",
        createdAt: new Date("2026-11-13T00:00:00Z"),
        updatedAt: new Date("2026-11-13T00:00:00Z"),
      },
    };
    const ctx: ApiContext = {
      auth: directAuth,
      actor: {
        id: auth.project.ownerId,
        memberships: [{ projectId: auth.project.id, role: "admin" as const }],
      },
      origin: apiRequestOrigin(directAuth, new Headers()),
      headers: new Headers(),
      instance: url.pathname,
      method,
      path: url.pathname.replace("/api/v1/", "").split("/"),
      req: new Request(url, { method }),
      url,
    };
    expect(
      await modelPlaygroundRoute({
        ...ctx,
        method: "GET",
        path: ["projects", projectId, "model-playground", "catalog"],
      }),
    ).toMatchObject({ status: 503 });
    expect(await modelPlaygroundRoute(ctx)).toBeNull();
    for (const member of ["checkConnection", "catalog", "preview", "create", "read"] as const)
      expect(mocks.service[member]).not.toHaveBeenCalled();
  });
  it.each([
    { failure: "throw", outcome: "replayed", confirmed: false },
    { failure: "malformed", outcome: "replayed", confirmed: false },
    { failure: "throw", outcome: "confirmation", confirmed: false },
    { failure: "malformed", outcome: "confirmation", confirmed: false },
    { failure: "throw", outcome: "fresh", confirmed: false },
    { failure: "malformed", outcome: "fresh", confirmed: false },
    { failure: "throw", outcome: "refused", confirmed: false },
    { failure: "malformed", outcome: "refused", confirmed: false },
    { failure: "throw", outcome: "replayed", confirmed: true },
    { failure: "malformed", outcome: "replayed", confirmed: true },
  ])(
    "recovers $failure into $outcome (confirmed=$confirmed)",
    async ({ failure, outcome, confirmed }) => {
      if (failure === "throw")
        mocks.service.create.mockRejectedValueOnce(new Error("after commit"));
      else mocks.service.create.mockResolvedValueOnce({ ...admitted, attempts: null });
      const recovered =
        outcome === "replayed"
          ? { ...admitted, replayed: true }
          : outcome === "fresh"
            ? admitted
            : outcome === "confirmation"
              ? confirmation
              : { kind: "not_dispatched", reason: "quote_expired", quoteInvalidated: true };
      const body = confirmed ? { ...createBody, confirmUnknown } : createBody;
      mocks.service.create.mockResolvedValueOnce(recovered);
      expect((await request("POST", "runs", body, "A")).status).toBe(500);
      const cached = await request("POST", "runs", body, "A");
      expect(cached.status).toBe(500);
      expect(cached.headers.get("Idempotency-Replayed")).toBe("true");
      expect(mocks.service.create).toHaveBeenCalledOnce();
      const recovery = await request("POST", "runs", body, "B");
      expect(recovery.status).toBe(200);
      expect((await recovery.json()).data).toEqual(
        (await import("./surface")).snakeizeKeys(recovered),
      );
      expect(mocks.service.create).toHaveBeenCalledTimes(2);
      expect(mocks.service.create.mock.calls[1].slice(1)).toEqual([body, "B"]);
    },
  );
  it.each(["old", "new"])("uses %s key after disabled rollout", async (key) => {
    mocks.service.enabled = false;
    expect((await request("POST", "runs", createBody, "old")).status).toBe(503);
    mocks.service.enabled = true;
    const response = await request("POST", "runs", createBody, key);
    expect(response.status).toBe(key === "old" ? 503 : 200);
    expect(mocks.service.create).toHaveBeenCalledTimes(key === "old" ? 0 : 1);
  });
  it.each(["lowercase", "uppercase"])("normalizes a %s run UUID before read", async (casing) => {
    const requested = casing === "uppercase" ? runId.toUpperCase() : runId;
    const response = await request("GET", `runs/${requested}`);
    expect(response.status).toBe(200);
    expect((await response.json()).data.run_id).toBe(runId);
    expect(mocks.service.read.mock.calls[0][1]).toBe(runId);
    expect(mocks.service.create).not.toHaveBeenCalled();
  });
  it("resolves personal-token project membership before calling the service", async () => {
    const personal = {
      kind: "personal_token",
      user: { id: "pat-owner" },
      token: { id: "pat-fixture", name: "Fixture", prefix: "bsb_pat", scopes: ["read", "write"] },
      memberships: [{ projectId: auth.project.id, role: "member" }],
    };
    expect(
      (await request("POST", "runs", createBody, "pat-create", personal as never)).status,
    ).toBe(200);
    expect(mocks.project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: projectId } }),
    );
    expect(mocks.service.create.mock.calls[0][0]).toMatchObject({
      projectId: auth.project.id,
      projectPublicId: projectId,
      actor: { id: "pat-owner" },
      credential: { id: "pat-fixture", kind: "personal_token" },
    });
    mocks.service.create.mockClear();
    expect(
      (
        await request("POST", "runs", { invalid: true }, "pat-denied", {
          ...personal,
          memberships: [],
        } as never)
      ).status,
    ).toBe(404);
    expect(mocks.service.create).not.toHaveBeenCalled();
  });
  it.each([500, 503])("caches a %i response under its original key", async (status) => {
    if (status === 500) mocks.service.create.mockRejectedValueOnce(new Error("after commit"));
    else mocks.service.create.mockResolvedValueOnce({ kind: "not_available_yet" });
    const first = await request("POST", "runs", createBody, "failure");
    const replay = await request("POST", "runs", createBody, "failure");
    expect(first.status).toBe(status);
    expect(await replay.json()).toEqual(await first.json());
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
    expect(mocks.service.create).toHaveBeenCalledOnce();
  });
  it("keeps every answer when one receipt is measured 0.125", async () => {
    const unit = { kind: "currency" as const, code: "USD" };
    const paid = (
      answer: string,
      id: string,
      amount: string,
      receiptCost: { certainty: "measured" | "unknown"; value: string | null },
    ) => {
      const base = result();
      const column = { ...base.column, columnId: id };
      const settled = receiptCost.certainty === "measured";
      return {
        column,
        state: "completed" as const,
        attemptId: `attempt-${id}`,
        attemptState: "observed" as const,
        result: {
          ...base,
          answer,
          citations: id === base.column.columnId ? base.citations : [],
          column,
          providerCost: {
            amount,
            currency: "USD",
            certainty: "reported" as const,
            basis: "provider_response" as const,
            rateCardVersion: null,
          },
          paymentReceipt: {
            actionId: "attempt",
            quoteId: null,
            state: settled ? "settled" : "unknown",
            option: {
              id: column.payment.optionId,
              connectionId: column.connectionId,
              providerId: column.providerId,
              providerLabel: "Native provider",
              fundingSource: "byok" as const,
              payableUnit: unit,
            },
            charge: settled
              ? { value: receiptCost.value, certainty: "measured" as const, unit }
              : { value: null, certainty: "unknown" as const, unit },
            providerCost: { ...receiptCost, unit },
          },
        },
      };
    };
    const keptId = "019a70b2-0000-7000-8000-000000000004";
    mocks.service.read.mockResolvedValue({
      version: 1,
      runId,
      projectId,
      reportId: null,
      prompt: input().prompt,
      responseLanguage: "en",
      columns: [
        paid("An answer with two citations.", result().column.columnId, "0.12", {
          certainty: "measured",
          value: "0.125",
        }),
        paid("Other column paid answer.", keptId, "0.20", {
          certainty: "measured",
          value: "0.20",
        }),
      ],
    });
    const response = await request("GET", `runs/${runId}`);
    expect(response.status).toBe(200);
    const columns = (await response.json()).data.columns;
    expect(columns[0].result.answer).toBe("An answer with two citations.");
    expect(columns[0].result.provider_cost).toMatchObject({
      amount: "0.12",
      certainty: "reported",
    });
    expect(columns[0].result.payment_receipt.provider_cost).toMatchObject({
      certainty: "unknown",
      value: null,
    });
    expect(columns[0].result.payment_receipt.cost_evidence).toBe("mismatch");
    expect(columns[1].result.answer).toBe("Other column paid answer.");
    expect(columns[1].result.payment_receipt.provider_cost).toMatchObject({
      certainty: "measured",
      value: "0.20",
    });
    expect(columns[1].result.payment_receipt.cost_evidence).toBeUndefined();
    expect(mocks.service.create).not.toHaveBeenCalled();
  });
  it("returns an unsettled receipt unchanged", async () => {
    const unit = { kind: "currency" as const, code: "USD" };
    const base = result();
    const keptId = "019a70b2-0000-7000-8000-000000000004";
    const kept = { ...base.column, columnId: keptId };
    mocks.service.read.mockResolvedValue({
      version: 1,
      runId,
      projectId,
      reportId: null,
      prompt: input().prompt,
      responseLanguage: "en",
      columns: [
        {
          column: base.column,
          state: "completed",
          attemptId: "attempt-a",
          attemptState: "observed",
          result: {
            ...base,
            providerCost: {
              amount: "0.12",
              basis: "provider_response",
              certainty: "reported",
              currency: "USD",
              rateCardVersion: null,
            },
            paymentReceipt: {
              actionId: "attempt",
              charge: { certainty: "unknown", unit, value: null },
              option: {
                connectionId: base.column.connectionId,
                fundingSource: "byok",
                id: base.column.payment.optionId,
                payableUnit: unit,
                providerId: base.column.providerId,
                providerLabel: "Native provider",
              },
              providerCost: { certainty: "unknown", unit, value: null },
              quoteId: null,
              state: "unknown",
            },
          },
        },
        {
          column: kept,
          state: "completed",
          attemptId: "attempt-b",
          attemptState: "observed",
          result: {
            ...base,
            answer: "Other column paid answer.",
            citations: [],
            column: kept,
            providerCost: {
              amount: "0.20",
              basis: "provider_response",
              certainty: "reported",
              currency: "USD",
              rateCardVersion: null,
            },
            paymentReceipt: {
              actionId: "attempt",
              charge: { certainty: "measured", unit, value: "0.20" },
              option: {
                connectionId: kept.connectionId,
                fundingSource: "byok",
                id: kept.payment.optionId,
                payableUnit: unit,
                providerId: kept.providerId,
                providerLabel: "Native provider",
              },
              providerCost: { certainty: "measured", unit, value: "0.20" },
              quoteId: null,
              state: "settled",
            },
          },
        },
      ],
    });
    const response = await request("GET", `runs/${runId}`);
    expect(response.status).toBe(200);
    const columns = (await response.json()).data.columns;
    expect(columns[0].result.answer).toBe("An answer with two citations.");
    expect(columns[0].result.provider_cost).toMatchObject({
      amount: "0.12",
      certainty: "reported",
    });
    expect(columns[0].result.payment_receipt.provider_cost).toEqual({
      certainty: "unknown",
      unit,
      value: null,
    });
    expect(columns[0].result.payment_receipt.cost_evidence).toBeUndefined();
    expect(columns[1].result.answer).toBe("Other column paid answer.");
  });
  it.each(["absent", "present"] as const)(
    "keeps every answer when a result cost is estimated and the receipt is %s",
    async (receipt) => {
      const unit = { kind: "currency" as const, code: "USD" };
      const base = result();
      const keptId = "019a70b2-0000-7000-8000-000000000004";
      const kept = { ...base.column, columnId: keptId };
      const estimated = {
        amount: "0.11",
        basis: "rate_card" as const,
        certainty: "estimated" as const,
        currency: "USD",
        rateCardVersion: "v3",
      };
      mocks.service.read.mockResolvedValue({
        version: 1,
        runId,
        projectId,
        reportId: null,
        prompt: input().prompt,
        responseLanguage: "en",
        columns: [
          {
            column: base.column,
            state: "completed",
            attemptId: "attempt-a",
            attemptState: "observed",
            result: {
              ...base,
              providerCost: estimated,
              paymentReceipt:
                receipt === "absent"
                  ? null
                  : {
                      actionId: "attempt",
                      charge: { certainty: "measured", unit, value: "0.20" },
                      option: {
                        connectionId: base.column.connectionId,
                        fundingSource: "byok",
                        id: base.column.payment.optionId,
                        payableUnit: unit,
                        providerId: base.column.providerId,
                        providerLabel: "Native provider",
                      },
                      providerCost: { certainty: "measured", unit, value: "0.20" },
                      quoteId: null,
                      state: "settled",
                    },
            },
          },
          {
            column: kept,
            state: "completed",
            attemptId: "attempt-b",
            attemptState: "observed",
            result: {
              ...base,
              answer: "Other column paid answer.",
              citations: [],
              column: kept,
            },
          },
        ],
      });
      const response = await request("GET", `runs/${runId}`);
      expect(response.status).toBe(200);
      const columns = (await response.json()).data.columns;
      expect(columns[0].result.answer).toBe("An answer with two citations.");
      expect(columns[0].result.provider_cost.amount).toBeNull();
      expect(columns[0].result.provider_cost.certainty).toBe("unknown");
      expect(JSON.stringify(columns[0].result.provider_cost)).not.toContain("0.11");
      expect(columns[0].result.cost_evidence.local_estimate).toMatchObject({
        amount: "0.11",
        basis: "rate_card",
        certainty: "estimated",
      });
      expect(columns[0].result.cost_evidence.provider_reported).toBeNull();
      if (receipt === "present") {
        expect(columns[0].result.payment_receipt.provider_cost).toEqual({
          certainty: "measured",
          unit,
          value: "0.20",
        });
        expect(columns[0].result.payment_receipt.cost_evidence).toBeUndefined();
      }
      expect(columns[1].result.answer).toBe("Other column paid answer.");
    },
  );
  it("rejects malformed preview JSON before a connection check", async () => {
    const url = new URL(
      `https://example.com/api/v1/projects/${projectId}/model-playground/runs/preview`,
    );
    const response = await handleMcpPreauthenticatedApiRequest(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"columns":[',
      }),
      url.pathname.replace("/api/v1/", "").split("/"),
      { auth: auth as never },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).type).toBe("https://bisibility.com/problems/bad_request");
    expect(mocks.service.checkConnection).not.toHaveBeenCalled();
    expect(mocks.service.preview).not.toHaveBeenCalled();
  });
  it("previews a valid body through the capped reader", async () => {
    const response = await request("POST", "runs/preview", input());
    expect(response.status).toBe(200);
    expect(mocks.service.preview).toHaveBeenCalledOnce();
  });
  it("refuses an oversized preview before reading the body", async () => {
    const url = new URL(
      `https://example.com/api/v1/projects/${projectId}/model-playground/runs/preview`,
    );
    const inner = new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    let reads = 0;
    const req = new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === "headers") {
          const headers = new Headers(target.headers);
          headers.set("content-length", String(IDEMPOTENCY_BODY_BYTES + 1));
          return headers;
        }
        if (prop === "body") {
          reads += 1;
          return Reflect.get(target, prop, receiver);
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const response = await handleMcpPreauthenticatedApiRequest(
      req,
      url.pathname.replace("/api/v1/", "").split("/"),
      { auth: auth as never },
    );
    expect(response.status).toBe(413);
    expect(reads).toBe(0);
    expect(mocks.service.checkConnection).not.toHaveBeenCalled();
    expect(mocks.service.preview).not.toHaveBeenCalled();
  });
  it("reads every admitted stored money shape without dropping an answer", async () => {
    const shapes = [
      {
        amount: "1.25",
        currency: "USD",
        certainty: "reported" as const,
        basis: "provider_response" as const,
        rateCardVersion: null,
      },
      {
        amount: "1.25",
        currency: "USD",
        certainty: "reported" as const,
        basis: "original_request_readback" as const,
        rateCardVersion: null,
      },
      {
        amount: "1.25",
        currency: "USD",
        certainty: "estimated" as const,
        basis: "rate_card" as const,
        rateCardVersion: "v1",
      },
      {
        amount: null,
        currency: "USD",
        certainty: "unknown" as const,
        basis: "unknown" as const,
        rateCardVersion: null,
      },
    ];
    expect(shapes.every((shape) => modelMoneySchema.safeParse(shape).success)).toBe(true);
    const scope = {
      kind: "unknown" as const,
      includes: [] as string[],
      excludes: [] as string[],
      unknown: [
        "inference",
        "tools",
        "routing",
        "reporting_writes",
        "zero_data_retention",
        "other",
      ],
    };
    const targets = [
      "providerCost",
      "providerReported",
      "upstream.total",
      "upstream.input",
      "upstream.output",
      "localEstimate",
    ] as const;
    const admitted = targets.flatMap((target) =>
      shapes
        .filter((shape) =>
          target === "providerCost"
            ? true
            : target === "localEstimate"
              ? shape.certainty === "estimated"
              : shape.certainty === "reported",
        )
        .map((shape) => ({ target, shape })),
    );
    expect(admitted).toHaveLength(13);
    const rejected = [
      {
        target: "providerCost" as const,
        shape: {
          amount: "1.25",
          currency: "USD",
          certainty: "reported" as const,
          basis: "rate_card" as const,
          rateCardVersion: "v1",
        },
      },
      {
        target: "providerReported" as const,
        shape: shapes[3],
      },
      { target: "upstream.output" as const, shape: shapes[3] },
      { target: "localEstimate" as const, shape: shapes[0] },
    ];
    const stored = structuredClone(await mocks.service.read());
    for (const item of [...admitted, ...rejected]) {
      const run = structuredClone(stored);
      const second = structuredClone(run.columns[0]);
      second.column = { ...second.column, columnId: "019a70b2-0000-7000-8000-000000000099" };
      second.result = {
        ...second.result,
        answer: "Other column paid answer.",
        column: second.column,
      };
      second.attemptId = "attempt-b";
      const evidence = {
        providerReported: null as unknown,
        upstreamInference: null as unknown,
        localEstimate: null as unknown,
      };
      if (item.target === "providerCost") run.columns[0].result.providerCost = item.shape;
      else if (item.target === "providerReported")
        evidence.providerReported = { money: item.shape, scope };
      else if (item.target === "localEstimate") evidence.localEstimate = item.shape;
      else {
        const part = item.target.split(".")[1];
        evidence.upstreamInference = { total: null, input: null, output: null, [part]: item.shape };
      }
      if (item.target !== "providerCost") run.columns[0].result.costEvidence = evidence;
      run.columns = [run.columns[0], second];
      mocks.service.read.mockResolvedValueOnce(run);
      const response = await request("GET", `runs/${runId}`);
      const body = await response.json();
      expect(
        response.status,
        `${item.target} ${item.shape.certainty}/${item.shape.basis} ${JSON.stringify(body)}`,
      ).toBe(200);
      expect(
        body.data.columns.map((column: { result: { answer: string } }) => column.result.answer),
      ).toEqual(["An answer with two citations.", "Other column paid answer."]);
    }
  });
  it("refuses a preview body over the cap before the service", async () => {
    const url = new URL(
      `https://example.com/api/v1/projects/${projectId}/model-playground/runs/preview`,
    );
    const response = await handleMcpPreauthenticatedApiRequest(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(IDEMPOTENCY_BODY_BYTES + 1));
            controller.close();
          },
        }),
        // @ts-expect-error duplex is required for a streaming request body.
        duplex: "half",
      }),
      url.pathname.replace("/api/v1/", "").split("/"),
      { auth: auth as never },
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      instance: `urn:bisibility:api:v1:${url.pathname}`,
      status: 413,
      type: "https://bisibility.com/problems/bad_request",
    });
    expect(mocks.service.preview).not.toHaveBeenCalled();
  });
  it("keeps a measured receipt when a result cost is estimated", async () => {
    const unit = { kind: "currency" as const, code: "USD" };
    const base = result();
    mocks.service.read.mockResolvedValue({
      version: 1,
      runId,
      projectId,
      reportId: null,
      prompt: input().prompt,
      responseLanguage: "en",
      columns: [
        {
          column: base.column,
          state: "completed",
          attemptId: "attempt-a",
          attemptState: "observed",
          result: {
            ...base,
            providerCost: {
              amount: "0.11",
              basis: "rate_card",
              certainty: "estimated",
              currency: "USD",
              rateCardVersion: "v3",
            },
            paymentReceipt: {
              actionId: "attempt",
              charge: { certainty: "measured", unit, value: "0.20" },
              option: {
                connectionId: base.column.connectionId,
                fundingSource: "byok",
                id: base.column.payment.optionId,
                payableUnit: unit,
                providerId: base.column.providerId,
                providerLabel: "Native provider",
              },
              providerCost: { certainty: "measured", unit, value: "0.20" },
              quoteId: null,
              state: "settled",
            },
          },
        },
      ],
    });
    const response = await request("GET", `runs/${runId}`);
    expect(response.status).toBe(200);
    const column = (await response.json()).data.columns[0];
    expect(column.result.answer).toBe(base.answer);
    expect(column.result.payment_receipt.provider_cost).toMatchObject({
      certainty: "measured",
      value: "0.20",
    });
    expect(column.result.payment_receipt.cost_evidence).toBeUndefined();
    expect(column.result_issue).toBeNull();
  });
  it("returns one unprojectable column without hiding another answer", async () => {
    const base = result();
    const other = { ...base.column, columnId: "019a70b2-0000-7000-8000-000000000004" };
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.service.read.mockResolvedValue({
      version: 1,
      runId,
      projectId,
      reportId: null,
      prompt: input().prompt,
      responseLanguage: "en",
      columns: [
        {
          column: base.column,
          state: "completed",
          attemptId: "attempt-a",
          attemptState: "observed",
          result: { ...base, answer: "Kept paid answer." },
        },
        {
          column: other,
          state: "completed",
          attemptId: "attempt-b",
          attemptState: "observed",
          result: {
            ...base,
            answer: "Hidden paid answer.",
            column: other,
            startedAt: "2026-01-02T00:00:00.000Z",
            finishedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      ],
    });
    const response = await request("GET", `runs/${runId}`);
    expect(response.status).toBe(200);
    const columns = (await response.json()).data.columns;
    expect(columns[0].result.answer).toBe("Kept paid answer.");
    expect(columns[0].result_issue).toBeNull();
    expect(columns[1].result).toBeNull();
    expect(columns[1].result_issue).toBe("unprojectable");
    expect(logged).toHaveBeenCalledWith("[model-playground] Could not project a column result.", {
      columnId: other.columnId,
      runId,
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("Hidden paid answer.");
    logged.mockRestore();
  });
  it("marks a completed column with a null result unprojectable", async () => {
    const base = result();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const states = ["completed", "queued", "failed", "unknown", "cancelled", "claimed"] as const;
    mocks.service.read.mockResolvedValue({
      version: 1,
      runId,
      projectId,
      reportId: null,
      prompt: input().prompt,
      responseLanguage: "en",
      columns: states.map((state, index) => ({
        column: { ...base.column, columnId: `019a70b2-0000-7000-8000-00000000010${index}` },
        state,
        attemptId: null,
        attemptState: null,
        result: null,
      })),
    });
    const response = await request("GET", `runs/${runId}`);
    expect(response.status).toBe(200);
    const columns = (await response.json()).data.columns;
    expect(columns[0]).toMatchObject({
      result: null,
      result_issue: "unprojectable",
      state: "completed",
    });
    for (const column of columns.slice(1)) expect(column.result_issue).toBeNull();
    expect(logged).toHaveBeenCalledWith("[model-playground] Could not project a column result.", {
      columnId: columns[0].column.column_id,
      runId,
    });
    logged.mockRestore();
  });
  it("marks a non-record stored result unprojectable without hiding another answer", async () => {
    const base = result();
    const other = { ...base.column, columnId: "019a70b2-0000-7000-8000-000000000111" };
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.service.read.mockResolvedValue({
      version: 1,
      runId,
      projectId,
      reportId: null,
      prompt: input().prompt,
      responseLanguage: "en",
      columns: [
        {
          column: base.column,
          state: "completed",
          attemptId: "attempt-a",
          attemptState: "observed",
          result: { ...base, answer: "Kept paid answer." },
        },
        {
          column: other,
          state: "completed",
          attemptId: "attempt-b",
          attemptState: "observed",
          result: "Hidden paid answer.",
        },
      ],
    });
    const response = await request("GET", `runs/${runId}`);
    expect(response.status).toBe(200);
    const columns = (await response.json()).data.columns;
    expect(columns[0].result.answer).toBe("Kept paid answer.");
    expect(columns[0].result_issue).toBeNull();
    expect(columns[1].result).toBeNull();
    expect(columns[1].result_issue).toBe("unprojectable");
    expect(logged).toHaveBeenCalledWith("[model-playground] Could not project a column result.", {
      columnId: other.columnId,
      runId,
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("Hidden paid answer.");
    logged.mockRestore();
  });
});
