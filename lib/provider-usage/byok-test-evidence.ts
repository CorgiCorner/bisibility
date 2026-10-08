import { vi } from "vitest";

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
