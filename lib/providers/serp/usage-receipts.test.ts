import { describe, expect, it } from "vitest";
import { dataForSeoUsageReceipt, serpApiUsageReceipt } from "./usage-receipts";

describe("serpApiUsageReceipt", () => {
  it("yields zero quantity for a provider-cached response", () => {
    expect(
      serpApiUsageReceipt({ search_metadata: { id: "cached-1", status: "Cached" } }, { ok: true }),
    ).toEqual({
      cached: true,
      costCents: 0,
      failed: false,
      providerRequestId: "cached-1",
      quantity: 0,
    });
  });

  it("yields one unit for a successful response even without an organic payload", () => {
    expect(
      serpApiUsageReceipt({ search_metadata: { id: "ok-1", status: "Success" } }, { ok: true }),
    ).toEqual({
      cached: false,
      costCents: 0,
      failed: false,
      providerRequestId: "ok-1",
      quantity: 1,
    });
    expect(
      serpApiUsageReceipt(
        { organic_results: [], search_metadata: { status: "Success" } },
        { ok: true },
      ),
    ).toMatchObject({ quantity: 1 });
  });

  it("marks Error status and provider error fields as failed with zero quantity", () => {
    expect(
      serpApiUsageReceipt({ search_metadata: { status: "Error" } }, { ok: true }),
    ).toMatchObject({ failed: true, quantity: 0 });
    expect(
      serpApiUsageReceipt(
        { error: "Invalid API key", search_metadata: { status: "Success" } },
        { ok: true },
      ),
    ).toMatchObject({ failed: true, quantity: null });
  });

  it("marks non-2xx transport status as failed", () => {
    expect(serpApiUsageReceipt(null, { ok: false })).toMatchObject({
      failed: true,
      quantity: null,
    });
  });

  it("reports unknown quantity instead of inventing zero when status metadata is absent", () => {
    expect(serpApiUsageReceipt(null, { ok: true })).toEqual({
      cached: false,
      costCents: 0,
      failed: false,
      providerRequestId: undefined,
      quantity: null,
    });
    expect(serpApiUsageReceipt({ search_metadata: {} }, { ok: true })).toMatchObject({
      quantity: null,
    });
  });
});

describe("dataForSeoUsageReceipt", () => {
  it("keeps a fractional reported cost in cents", () => {
    const receipt = dataForSeoUsageReceipt(
      {
        cost: 0.01,
        status_code: 20000,
        tasks: [{ cost: 0.01, id: "task-1", status_code: 20000 }],
      },
      { ok: true },
    );
    expect(receipt).toEqual({
      cached: false,
      costCents: 1,
      failed: false,
      providerRequestId: "task-1",
      quantity: 1,
    });
  });

  it("sums task costs when the envelope omits its own cost", () => {
    const receipt = dataForSeoUsageReceipt(
      {
        status_code: 20000,
        tasks: [
          { cost: 0.012, id: "task-1", status_code: 20000 },
          { cost: 0.008, id: "task-2", status_code: 20000 },
        ],
      },
      { ok: true },
    );
    // Multiple tasks cannot be attributed to a single provider request id.
    expect(receipt).toMatchObject({ costCents: 2, providerRequestId: undefined, quantity: 1 });
  });

  it("reports unknown cost instead of inventing zero when no cost metadata exists", () => {
    const receipt = dataForSeoUsageReceipt(
      { status_code: 20000, tasks: [{ status_code: 20000 }] },
      {
        ok: true,
      },
    );
    expect(receipt).toMatchObject({ costCents: null, failed: false });
    expect(receipt.costCents).not.toBe(0);
  });

  it("marks task-level and envelope-level failures as failed", () => {
    expect(
      dataForSeoUsageReceipt(
        {
          cost: 0.01,
          status_code: 20000,
          tasks: [{ cost: 0.01, status_code: 40501, status_message: "Invalid Field: 'limit'" }],
        },
        { ok: true },
      ),
    ).toMatchObject({ costCents: 1, failed: true, quantity: 1 });
    expect(dataForSeoUsageReceipt({ status_code: 40201 }, { ok: true })).toMatchObject({
      failed: true,
    });
    expect(dataForSeoUsageReceipt({ status_code: 20000 }, { ok: false })).toMatchObject({
      failed: true,
    });
  });

  it("keeps a charged cost on a failed response rather than dropping it", () => {
    const receipt = dataForSeoUsageReceipt(
      { cost: 0.07, status_code: 500, tasks: [{ cost: 0.07, id: "task-1", status_code: 50000 }] },
      { ok: false },
    );
    expect(receipt).toMatchObject({ costCents: 7, failed: true });
  });
});
