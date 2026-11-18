import { input, result, unknownMoney } from "@/lib/model-playground/contract-fixtures.test-support";
import { describe, expect, it } from "vitest";
import { modelPlaygroundRunIdContract } from "./model-playground-registry";
import {
  modelPlaygroundAdmissionSchema,
  modelPlaygroundPreviewInputSchema,
  modelPlaygroundPreviewSchema,
  modelPlaygroundResultSchema,
  modelPlaygroundRunSchema,
  projectModelPlaygroundRun,
} from "./model-playground-schemas";
import { pathParameterProblems } from "./openapi-sdk-lint-operations.test-support";
import type { SdkDocument } from "./openapi-sdk-lint-schema.test-support";

const quoteId = "019a70b2-0000-7000-8000-000000000002";
const columnId = input().columns[0].columnId;
const money = {
  amount: "0.01",
  currency: "USD",
  certainty: "estimated",
  basis: "rate_card",
  rateCardVersion: "rates-v1",
};
describe("Model Playground response invariants", () => {
  it("keeps forecast amounts nullable and rejects reported money in a preview", () => {
    const preview = {
      version: 1,
      quoteId,
      expiresAt: "2026-11-13T12:10:00Z",
      forecasts: [{ columnId, money: unknownMoney, complete: false }],
    };
    expect(modelPlaygroundPreviewSchema.safeParse(preview).success).toBe(true);
    expect(
      modelPlaygroundPreviewSchema.safeParse({
        ...preview,
        forecasts: [{ columnId, money, complete: true }],
      }).success,
    ).toBe(true);
    expect(
      modelPlaygroundPreviewSchema.safeParse({
        ...preview,
        forecasts: [
          {
            columnId,
            money: {
              ...money,
              certainty: "reported",
              basis: "provider_response",
              rateCardVersion: null,
            },
            complete: true,
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("retains cost scope and rejects estimates presented as reported provider evidence", () => {
    const value = result();
    value.costEvidence = {
      providerReported: null,
      upstreamInference: null,
      localEstimate: { ...money, certainty: "estimated", basis: "rate_card" },
    };
    expect(modelPlaygroundResultSchema.safeParse(value).success).toBe(true);
    Object.assign(value.costEvidence, {
      providerReported: {
        money: {
          ...money,
          certainty: "reported",
          basis: "provider_response",
          rateCardVersion: null,
        },
        scope: {
          kind: "total",
          includes: [
            "inference",
            "tools",
            "routing",
            "reporting_writes",
            "zero_data_retention",
            "other",
          ],
          excludes: [],
          unknown: [],
        },
      },
    });
    expect(modelPlaygroundResultSchema.safeParse(value).success).toBe(true);
    Object.assign(value.costEvidence.providerReported ?? {}, { money });
    expect(modelPlaygroundResultSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    { ...money, certainty: "unknown", basis: "rate_card", amount: "0.00" },
    { ...money, certainty: "estimated", basis: "unknown" },
  ])("rejects inconsistent forecast money %#", (invalid) => {
    const preview = {
      version: 1,
      quoteId,
      expiresAt: "2026-11-13T12:10:00Z",
      forecasts: [{ columnId, money, complete: true }],
    };
    expect(modelPlaygroundPreviewSchema.safeParse(preview).success).toBe(true);
    preview.forecasts[0].money = invalid;
    expect(modelPlaygroundPreviewSchema.safeParse(preview).success).toBe(false);
  });
  it("never accepts an estimate as the reported provider cost", () => {
    const value = result();
    expect(modelPlaygroundResultSchema.safeParse(value).success).toBe(true);
    Object.assign(value, { providerCost: money });
    expect(modelPlaygroundResultSchema.safeParse(value).success).toBe(false);
  });
  it("retains an unknown own-key receipt without inventing money", () => {
    const value = result();
    const unit = { kind: "currency", code: "USD" };
    const receipt = {
      actionId: "attempt",
      quoteId,
      state: "unknown",
      option: {
        id: value.column.payment.optionId,
        connectionId: value.column.connectionId,
        providerId: value.column.providerId,
        providerLabel: "Native provider",
        fundingSource: "byok",
        payableUnit: unit,
      },
      charge: { value: null, certainty: "unknown", unit },
      providerCost: { value: null, certainty: "unknown", unit },
    };
    Object.assign(value, { paymentReceipt: receipt });
    expect(modelPlaygroundResultSchema.safeParse(value).success).toBe(true);
    const { providerCost: _cost, ...absentCost } = receipt;
    Object.assign(value, { paymentReceipt: absentCost });
    expect(modelPlaygroundResultSchema.safeParse(value).success).toBe(false);
    for (const connectionId of [
      "invalid",
      "prj_a00000000000000000000000",
      `conn_${"a".repeat(25)}`,
    ]) {
      Object.assign(value, {
        paymentReceipt: { ...receipt, option: { ...receipt.option, connectionId } },
      });
      expect(modelPlaygroundResultSchema.safeParse(value).success).toBe(false);
    }
    for (const field of ["wallet_id", "hold_id", "debit_id", "credits_remaining"]) {
      Object.assign(value, { paymentReceipt: { ...receipt, [field]: "forbidden" } });
      expect(modelPlaygroundResultSchema.safeParse(value).success).toBe(false);
    }
    Object.assign(value, {
      paymentReceipt: {
        ...receipt,
        charge: { ...receipt.charge, value: "0.01", certainty: "estimate" },
      },
    });
    expect(modelPlaygroundResultSchema.safeParse(value).success).toBe(false);
  });
  it("reads independent completed and unresolved columns without inventing a run total", () => {
    const answer = result();
    const value = {
      version: 1,
      runId: quoteId,
      projectId: "prj_a00000000000000000000000",
      reportId: null,
      prompt: input().prompt,
      responseLanguage: "en",
      columns: [
        {
          column: answer.column,
          state: "completed",
          attemptId: "attempt-a",
          attemptState: "observed",
          result: answer,
          resultIssue: null,
        },
        {
          column: { ...answer.column, columnId: "019a70b2-0000-7000-8000-000000000003" },
          state: "unknown",
          attemptId: "attempt-b",
          attemptState: "stale_unknown",
          result: null,
          resultIssue: null,
        },
      ],
    };
    expect(modelPlaygroundRunSchema.safeParse(value).success).toBe(true);
    expect(modelPlaygroundRunSchema.safeParse({ ...value, totalCost: 0 }).success).toBe(false);
    const platformId = `platform:${answer.column.providerId}`;
    const column = {
      ...answer.column,
      connectionId: platformId,
      payment: { fundingSource: "platform", optionId: platformId },
    };
    const projected = projectModelPlaygroundRun({
      ...value,
      columns: [
        {
          ...value.columns[0],
          column,
          result: { ...answer, column, paymentReceipt: { holdId: "private" } },
        },
      ],
    });
    expect(modelPlaygroundRunSchema.parse(projected).columns[0].result).toMatchObject({
      column,
      paymentReceipt: null,
    });
    expect(
      modelPlaygroundPreviewInputSchema.safeParse({ ...input(), columns: [column] }).success,
    ).toBe(false);
  });
  it("rejects unsupported admission outcomes and accepts the exact unknown set", () => {
    const value = {
      kind: "confirmation_required",
      nonce: quoteId,
      contentHash: "a".repeat(64),
      attemptIds: ["attempt-a"],
      earlierAttemptUnconfirmed: true,
    };
    expect(modelPlaygroundAdmissionSchema.safeParse(value).success).toBe(true);
    expect(
      modelPlaygroundAdmissionSchema.safeParse({ ...value, kind: "unknown_success" }).success,
    ).toBe(false);
  });
  it("limits the native UUID exception to its registered operation and path", () => {
    const document = { components: { schemas: {} }, paths: {} } as SdkDocument;
    const operation = {
      operationId: modelPlaygroundRunIdContract.operationId,
      parameters: [
        {
          in: "path",
          name: "project_id",
          required: true,
          schema: { type: "string", "x-bisibility-public-id": "prj" },
        },
        { in: "path", name: "run_id", required: true, schema: modelPlaygroundRunIdContract.schema },
      ],
    };
    expect(pathParameterProblems(document, modelPlaygroundRunIdContract.path, operation)).toEqual(
      [],
    );
    expect(
      pathParameterProblems(document, "/projects/{project_id}/other/{run_id}", operation),
    ).toEqual(["path-id-without-public-id run_id getModelPlaygroundRun"]);
  });
});
