import type { AccessContext, Meter, UsagePage } from "@usagekit/core";
import { expect, it, vi } from "vitest";
import { readOwnerUsage } from "./owner-reads";

const access = {} as AccessContext;
const query = {
  scope: { kind: "group" as const, namespace: "n", group: "p" },
  from: "2026-10-01T00:00:00Z",
  to: "2026-11-01T00:00:00Z",
};
const page = (principal: string, nextCursor?: string): UsagePage => ({
  asOf: "2026-10-11T12:00:00Z",
  watermark: "w",
  ...(nextCursor ? { nextCursor } : {}),
  rows: [
    {
      dimensions: {
        principal,
        connection: "private-connection",
        provider: "serpapi",
        source: "app",
        surface: "app",
      },
      fundingSource: "byok",
      costOwner: "secret-owner",
      cost: { certainty: "measured", money: { units: 10000n, currency: "USD" } },
      measurements: [],
      unknownOperations: 0n,
    },
  ],
});
it("follows pages containing only former owners before forming the total and detail", async () => {
  const usage = vi.fn(async (_access, q) => ({
    outcome: "ok",
    value: {
      ...page(q.cursor ? "owner" : "former", q.cursor ? undefined : "next"),
      rows: page(q.cursor ? "owner" : "former", q.cursor ? undefined : "next").rows.map((row) => ({
        ...row,
        dimensions:
          q.groupBy.length === 1 ? { principal: row.dimensions.principal } : row.dimensions,
      })),
    },
  }));
  const result = await readOwnerUsage(
    { usage } as unknown as Meter,
    access,
    query,
    "owner",
    new Map([["private-connection", "conn_public"]]),
  );
  expect(result.summary.complete).toBe(true);
  expect(result.summary.rowCount).toBe(1);
  expect(result.detail.rows).toHaveLength(1);
  expect(result.detail.rows[0].dimensions.connection).toBe("conn_public");
  expect(JSON.stringify(result)).not.toMatch(/private-|secret-|former|watermark":"w/);
  expect(usage).toHaveBeenCalledTimes(2);
});
it("refuses a changed detail snapshot rather than mixing amounts", async () => {
  const usage = vi.fn(async (_access, q) => ({
    outcome: "ok",
    value: {
      ...page("owner", q.groupBy.length > 1 && !q.cursor ? "next" : undefined),
      watermark: q.cursor ? "changed" : "w",
    },
  }));
  await expect(
    readOwnerUsage({ usage } as unknown as Meter, access, query, "owner", new Map()),
  ).rejects.toThrow("snapshot changed");
});

it("rejects changed summary evidence before adding pages", async () => {
  const usage = vi.fn(async (_access, q) => ({
    outcome: "ok",
    value: {
      ...page("owner", !q.cursor ? "next" : undefined),
      watermark: q.cursor ? "changed" : "w",
    },
  }));
  await expect(
    readOwnerUsage({ usage } as unknown as Meter, access, query, "owner", new Map()),
  ).rejects.toThrow("snapshot changed");
});

it("derives totals and details from one snapshot despite independent-query token differences", async () => {
  let snapshot = 0;
  const usage = vi.fn(async (_access, _query) => ({
    outcome: "ok",
    value: {
      ...page("owner"),
      watermark: `snapshot-${++snapshot}`,
      asOf: `2026-10-11T12:00:0${snapshot}Z`,
      rows: [
        {
          ...page("owner").rows[0],
          cost: {
            certainty: "measured",
            money: { units: BigInt(snapshot) * 10000n, currency: "USD" },
          },
        },
      ],
    },
  }));
  const result = await readOwnerUsage(
    { usage } as unknown as Meter,
    access,
    query,
    "owner",
    new Map(),
  );
  expect(result.summary.complete).toBe(true);
  expect(result.summary.cost).toEqual(result.detail.rows[0]?.cost);
  expect(result.summary.cost).toMatchObject({ text: "1.0000" });
  expect(usage).toHaveBeenCalledTimes(1);
  expect(usage.mock.calls[0]?.[1].groupBy).toEqual([
    "principal",
    "connection",
    "provider",
    "surface",
    "source",
  ]);
});

it("adds exact owner amounts across connections and pages before forming the shared summary", async () => {
  const row = (connection: string, units: bigint, requests: bigint, principal = "owner") => ({
    ...page(principal).rows[0],
    dimensions: { ...page(principal).rows[0].dimensions, connection },
    cost: { certainty: "measured" as const, money: { units, currency: "USD" as const } },
    measurements: [
      {
        unit: "requests",
        certainty: "measured" as const,
        quantity: { unit: "requests", value: requests, scale: 0 },
      },
    ],
  });
  const usage = vi.fn(async (_access, q) => ({
    outcome: "ok",
    value: {
      ...page("owner", q.cursor ? undefined : "next"),
      rows: q.cursor
        ? [row("c3", 2n, 4n), row("former", 999n, 999n, "former")]
        : [row("c1", 90071992547409930000n, 2n), row("c2", 1n, 3n)],
    },
  }));
  const result = await readOwnerUsage(
    { usage } as unknown as Meter,
    access,
    query,
    "owner",
    new Map(),
  );
  expect(result.summary).toMatchObject({
    complete: true,
    rowCount: 1,
    pages: 2,
    cost: { text: "9007199254740993.0003", certainty: "measured" },
    measurements: { requests: { text: "9" } },
  });
  expect(result.detail.rows).toHaveLength(3);
});
