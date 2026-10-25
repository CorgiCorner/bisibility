import { describe, expect, it } from "vitest";
import { historyCapability } from "./capabilities";
import {
  account,
  collect,
  envelope,
  httpDouble,
  now,
  page,
  payload,
  scope,
  window,
} from "./fixtures.test-support";
import { getHistoryTask, listHistory } from "./history";
import { lookupFailure } from "./outcomes";
import { assertHistoryRequest, createHistoryTransport } from "./transport";

const row = {
  id: "task-1",
  url: "v3/serp/google/organic/task_post",
  datetime_posted: "2026-10-23 10:00:00 +00:00",
  cost: 0.002,
  metadata: { ...payload, function: "task_post" },
};
const getInput = { ...scope, id: "task-1", submittedAt: window.from };

describe("read-only history entry points (INV-1)", () => {
  it("follows offset pagination and returns original metadata and nullable task costs", async () => {
    const double = httpDouble([
      page([row]),
      page([{ ...row, id: "task-2", cost: undefined }]),
      page([]),
    ]);
    const results = await collect(listHistory(double.transport, { ...window, limit: 1 }, now));
    expect(results.map((item) => item.kind)).toEqual(["page", "page", "empty_page"]);
    expect(results[0]).toMatchObject({
      tasks: [
        {
          id: "task-1",
          tag: payload.tag,
          endpointPath: scope.submittedEndpointPath,
          function: "task_post",
          datetimePosted: row.datetime_posted,
          costCents: 0.2,
        },
      ],
    });
    expect(results[1]).toMatchObject({ tasks: [{ id: "task-2", costCents: null }] });
    expect(double.send.mock.calls.map(([, init]) => JSON.parse(String(init?.body))[0])).toEqual(
      [0, 1, 2].map((offset) => ({
        datetime_from: "2026-10-23 10:00:00 +00:00",
        datetime_to: "2026-10-23 11:00:00 +00:00",
        limit: 1,
        offset,
        include_metadata: true,
        sort: "asc",
      })),
    );
    expect(double.limit).toHaveBeenCalledTimes(3);
    double.assertNoPaidRequests();
  });

  it("gets an existing task without using the queued envelope reader", async () => {
    const double = httpDouble([envelope(40106, 0.005)]);
    expect(await getHistoryTask(double.transport, getInput, now)).toMatchObject({
      kind: "evidence",
      topStatus: { code: 20000 },
      tasks: [{ classification: "partial", returnedDepth: 2, costCents: 0.5 }],
    });
    expect(double.send.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "error" });
    double.assertNoPaidRequests();
  });

  it("allows only the free ID List POST and the fixed Task GET path", () => {
    expect(() => assertHistoryRequest("POST", "/v3/serp/id_list")).not.toThrow();
    for (const [method, path] of [
      ["POST", scope.submittedEndpointPath],
      ["POST", "/v3/serp/google/organic/live/advanced"],
      ["POST", "/v3/serp/id_list?task_post=1"],
      ["GET", "/v3/serp/google/maps/task_get/advanced/task-1"],
      ["GET", "/v3/serp/google/organic/task_get/advanced/../task_post"],
    ]) {
      expect(() => assertHistoryRequest(method, path)).toThrow("refuses");
    }
  });
});

describe("lookup outcomes", () => {
  it("keeps acceptance and cost unknown for an empty ID List (AD-5)", async () => {
    const double = httpDouble([page([])]);
    expect(await collect(listHistory(double.transport, window, now))).toEqual([
      {
        kind: "empty_page",
        tasks: [],
        nextOffset: null,
        acceptance: "unknown",
        costCents: null,
        retryable: false,
        suggestedBackoffMs: null,
      },
    ]);
    double.assertNoPaidRequests();
  });

  it.each([429, 503])("returns retry metadata for HTTP %s without retrying", async (code) => {
    const double = httpDouble([
      new Response("", { status: code, headers: { "retry-after": "120" } }),
    ]);
    const [result] = await collect(listHistory(double.transport, window, now));
    expect(result).toMatchObject({
      kind: code === 429 ? "rate_limited" : "outage",
      retryable: true,
      acceptance: "unknown",
      costCents: null,
    });
    expect(result?.suggestedBackoffMs).toBeGreaterThan(0);
    expect(double.send).toHaveBeenCalledOnce();
    double.assertNoPaidRequests();
  });

  it.each([40202, 40209, 50000])("handles provider envelope status %s", async (code) => {
    const double = httpDouble([{ status_code: code }]);
    expect((await collect(listHistory(double.transport, window, now)))[0]).toMatchObject({
      kind: code >= 50000 ? "outage" : "rate_limited",
      retryable: true,
    });
    double.assertNoPaidRequests();
  });

  it("stops on a shared account limit before HTTP", async () => {
    const double = httpDouble([]);
    const limited = lookupFailure("rate_limited", "shared_account_limit", 1234);
    const transport = createHistoryTransport(account, {
      fetch: double.send,
      limit: async () => limited,
    });
    expect(await collect(listHistory(transport, window, now))).toEqual([limited]);
    expect(await getHistoryTask(transport, getInput, now)).toEqual(limited);
    expect(double.send).not.toHaveBeenCalled();
  });

  it.each([new Error("connection failed"), new Response("invalid json")])(
    "handles a transport outage without leaking errors",
    async (response) => {
      const double = httpDouble([response]);
      expect(await getHistoryTask(double.transport, getInput, now)).toMatchObject({
        kind: "outage",
        retryable: true,
      });
      double.assertNoPaidRequests();
    },
  );

  it("rejects unsupported Meter features, Maps and local finder before any request (AD-4)", async () => {
    const double = httpDouble([]);
    for (const unsupported of [
      { ...window, feature: "local_scan" as const },
      { ...window, submittedEndpointPath: "/v3/serp/google/maps/task_post" },
      { ...window, submittedEndpointPath: "/v3/serp/google/local_finder/task_post" },
      { ...window, provider: "serpapi" },
    ]) {
      expect(historyCapability(unsupported)).toMatchObject({ kind: "operator_review" });
      expect(await collect(listHistory(double.transport, unsupported, now))).toMatchObject([
        { kind: "operator_review" },
      ]);
      expect(
        await getHistoryTask(
          double.transport,
          { ...unsupported, id: "task-1", submittedAt: window.from },
          now,
        ),
      ).toMatchObject({ kind: "operator_review" });
    }
    expect(double.send).not.toHaveBeenCalled();
    double.assertNoPaidRequests();
  });

  it("finally exhausts metadata and results independently without a retry hint (AD-6)", async () => {
    const double = httpDouble([]);
    expect(
      await collect(
        listHistory(double.transport, { ...window, from: "2026-09-23T10:00:00Z" }, now),
      ),
    ).toEqual([lookupFailure("finally_unknown", "provider_metadata_retention_expired")]);
    expect(
      await getHistoryTask(
        double.transport,
        { ...getInput, submittedAt: "2026-09-24T12:00:00Z" },
        now,
      ),
    ).toEqual(lookupFailure("finally_unknown", "provider_result_retention_expired"));
    expect(double.send).not.toHaveBeenCalled();
    double.assertNoPaidRequests();
  });

  it("does not turn malformed pages, missing tasks or failed lookup status into empty success", async () => {
    for (const body of [
      { status_code: 20000 },
      { status_code: 20000, tasks: [{ status_code: 20000 }] },
      page([{}]),
      { status_code: 40100 },
      { status_code: 20000, tasks: [{ status_code: 40101 }] },
    ]) {
      const double = httpDouble([body]);
      expect((await collect(listHistory(double.transport, window, now)))[0]).toMatchObject({
        kind: "operator_review",
        costCents: null,
      });
    }
  });

  it("rejects invalid windows, pagination, missing original binding and conflicting task IDs", async () => {
    const double = httpDouble([envelope()]);
    for (const invalid of [
      { ...window, from: window.to },
      { ...window, from: "2026-10-23T10:00:00+02:00" },
      { ...window, limit: 1001 },
      { ...window, offset: -1 },
    ]) {
      expect((await collect(listHistory(double.transport, invalid, now)))[0]).toMatchObject({
        kind: "operator_review",
      });
    }
    expect(double.send).not.toHaveBeenCalled();
    expect(
      await getHistoryTask(double.transport, { ...getInput, id: "task-2" }, now),
    ).toMatchObject({ kind: "operator_review", reason: "native_task_id_conflict" });
    const unbound = createHistoryTransport(
      { ...account, credentialVersion: "" },
      { fetch: double.send },
    );
    expect(await unbound.getTask("task-1")).toMatchObject({
      reason: "missing_original_account_binding",
    });
    expect(double.send).toHaveBeenCalledOnce();
    double.assertNoPaidRequests();
  });
});
