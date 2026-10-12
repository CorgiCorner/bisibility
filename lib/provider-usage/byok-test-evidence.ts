import { createMeter } from "@usagekit/meter";
import { createCatalog, dataforseo, PricedRequest, serpapi } from "@usagekit/providers";
import { createMemoryStore } from "@usagekit/store";
import { vi } from "vitest";
import type { OwnAttemptInput } from "./admission-extension-types";

type Row = Record<string, unknown> & { id: string };
const matches = (row: Row, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object") {
      if ("notIn" in value) return !(value.notIn as unknown[]).includes(row[key]);
      if ("in" in value) return (value.in as unknown[]).includes(row[key]);
      if ("not" in value) return row[key] !== value.not;
    }
    return value === null ? row[key] == null : row[key] === value;
  });

/** Unit port fake only. Financial/source guarantees use real Postgres integration cases. */
export function byokTestEvidence(provider = "serpapi") {
  const rows: Row[] = [];
  const meteringUsageEvidence = {
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = {
        proofVersion: 0,
        measurementStatus: "unknown",
        discarded: false,
        canonicalId: null,
        providerRequestId: null,
        ...data,
      };
      rows.push(row);
      return row;
    }),
    findUnique: vi.fn(
      async ({ where }: { where: { id: string } }) =>
        rows.find((row) => row.id === where.id) ?? null,
    ),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rows.filter((row) => matches(row, where)),
    ),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = rows.find((row) => row.id === where.id);
      if (!row) throw new Error("Missing accounting fixture row");
      return row;
    }),
    findFirst: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((row) => matches(row, where)) ?? null,
    ),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((row) => row.id === where.id);
        if (!row) throw new Error("Missing accounting fixture row");
        Object.assign(row, data);
        return row;
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const selected = rows.filter((row) => matches(row, where));
        for (const row of selected) Object.assign(row, data);
        return { count: selected.length };
      },
    ),
  };
  return {
    meteringUsageEvidence,
    $queryRaw: vi.fn().mockResolvedValue([]),
    project: { findUnique: vi.fn().mockResolvedValue({ ownerId: "owner_1" }) },
    providerConnection: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ projectId: "project_1", provider, credentialSource: "own" }),
    },
    rows,
  };
}

export const testOwnAdmission = {
  reserve: vi.fn(async (_tx: unknown, inputs: readonly OwnAttemptInput[]) =>
    Promise.all(
      inputs.map(async (input) => {
        const grant = { attemptId: input.id, leaseId: `lease:${input.id}` };
        if (!input.providerRequest) return grant;
        // The port is a unit fixture, but snapshots still come from real pricing and admission.
        // Real PostgreSQL transport cases cover financial authority and transaction atomicity.
        const clock = { now: () => new Date("2026-10-11T12:00:00Z") };
        const provider =
          new URL(input.providerRequest.url).hostname === "serpapi.com" ? "serpapi" : "dataforseo";
        const pricedRequest = await PricedRequest.price({
          catalog: createCatalog({
            providers: [dataforseo, serpapi],
            enabled: [provider],
            now: clock.now,
          }),
          meter: createMeter({ store: createMemoryStore({ clock, budgets: [] }), clock }),
          rejectUnknown: true,
          request: input.providerRequest,
          input: {
            operationId: input.id,
            provider,
            scope: { namespace: "test", principal: "owner", connection: "connection" },
            fundingSource: "byok",
            costOwner: "owner",
            surface: "app",
            source: "app",
            estimate: [{ unit: "cents", value: 0n, scale: 0 }],
          },
        });
        return { ...grant, pricedRequest };
      }),
    ),
  ),
  acknowledge: vi.fn(async () => true),
  fence: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  owns: vi.fn(async () => true),
  assertRetrieval: vi.fn(async () => true),
  recover: vi.fn(async () => {}),
};
