import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import type { BudgetStatus } from "@usagekit/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  connections: vi.fn(),
  projects: vi.fn(),
  usage: vi.fn(),
  operations: vi.fn(),
  budgets: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { providerConnection: { findMany: m.connections }, project: { findMany: m.projects } },
}));
vi.mock("./runtime", () => ({
  meteringNamespace: () => "n",
  meteringRuntime: async () => ({
    meter: { usage: m.usage, listOperations: m.operations, applicableBudgets: m.budgets },
  }),
}));

import { readMeteringAdmin } from "./admin-data";

const retained = {
  id: "retained-project-internal",
  publicId: "prj_retained",
  ownerId: "retained-owner-private",
  name: "Retained project",
  members: [{ userId: "project-member" }],
};
const choices = Array.from({ length: 51 }, (_, index) => ({
  id: `project-${index}`,
  publicId: `prj_${index}`,
  ownerId: `owner-${index}`,
  name: `Project ${index}`,
}));
const connections = choices.map((project, index) => ({
  id: `connection-${index}`,
  publicId: `conn_${index}`,
  provider: "dataforseo",
  projectId: project.id,
  project,
}));
const retainedConnection = {
  id: "retained-connection-internal",
  publicId: "conn_retained",
  provider: "serpapi",
  projectId: retained.id,
  project: retained,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.projects.mockImplementation(async ({ where, take }) => {
    const selected = [...choices, retained].filter(
      (row) =>
        (!where?.id ||
          (typeof where.id === "string" ? row.id === where.id : where.id.in.includes(row.id))) &&
        (!where?.OR ||
          where.OR.some((rule: { ownerId?: string; members?: { some: { userId: string } } }) =>
            rule.ownerId
              ? row.ownerId === rule.ownerId
              : "members" in row &&
                Array.isArray(row.members) &&
                row.members.some(
                  (member: { userId: string }) => member.userId === rule.members?.some.userId,
                ),
          )),
    );
    return take ? selected.slice(0, take) : selected;
  });
  m.connections.mockImplementation(async ({ where, take }) => {
    const selected = [...connections, retainedConnection].filter(
      (row) =>
        (!where?.projectId || row.projectId === where.projectId) &&
        (!where?.id?.in || where.id.in.includes(row.id)),
    );
    return take ? selected.slice(0, take) : selected;
  });
  m.usage.mockResolvedValue({
    outcome: "ok",
    value: {
      asOf: "2026-10-15T00:00:00Z",
      watermark: "private-watermark",
      rows: [
        {
          fundingSource: "byok",
          costOwner: retained.ownerId,
          dimensions: {
            connection: retainedConnection.id,
            provider: "serpapi",
            source: "app",
            surface: "app",
          },
          cost: { certainty: "measured", money: { units: 0n, currency: "USD" } },
          measurements: [],
          unknownOperations: 0n,
        },
      ],
    },
  });
  m.operations.mockResolvedValue({
    outcome: "ok",
    value: { operations: [], asOf: "2026-10-15T00:00:00Z" },
  });
  m.budgets.mockResolvedValue({ outcome: "ok", value: [] });
});

describe("admin display references", () => {
  it.each([null, retained.id])(
    "resolves retained names beyond the capped scan with project filter %s",
    async (project) => {
      const data = await readMeteringAdmin({
        month: "2026-10",
        project,
        actorId: "project-member",
      });
      expect(data.projects).toEqual(choices.slice(0, 50).map((row) => row.id));
      expect(data.references?.projects).toMatchObject({
        prj_retained: retained.name,
      });
      expect(data.references?.connections).toMatchObject({
        conn_retained: { project: retained.name, provider: "serpapi" },
      });
      expect(data.usage.rows[0].dimensions.connection).toBe("conn_retained");
      if (project) expect(data.references?.projects[retained.id]).toBe(retained.name);
      else expect(data.references?.projects).not.toHaveProperty(retained.id);
      expect(data.references?.connections).not.toHaveProperty(retainedConnection.id);
      const publicData = JSON.stringify(data);
      if (!project) expect(publicData).not.toContain(retained.id);
      expect(publicData).not.toContain(retainedConnection.id);
      expect(publicData).not.toContain(retained.ownerId);
      expect(m.connections).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [retainedConnection.id] } },
          select: {
            id: true,
            publicId: true,
            provider: true,
            projectId: true,
            project: { select: { publicId: true } },
          },
        }),
      );
      if (project)
        expect(new Set(m.budgets.mock.calls.map(([, query]) => query.scope.group))).toEqual(
          new Set([retained.id]),
        );
      else expect(data.truncated).toBe(true);
    },
  );
  it("labels a connection budget before any usage or exception exists", async () => {
    m.usage.mockResolvedValue({ outcome: "ok", value: { rows: [], asOf: "2026-10-15T00:00:00Z" } });
    const amount = { value: 0n, scale: 4, unit: "cents" } as const;
    const budget: BudgetStatus = {
      budget: {
        id: "private-budget",
        version: 1,
        scope: {
          kind: "tag",
          namespace: "n",
          tag: ownAllocationTag("serpapi", retainedConnection.id),
        },
        surface: "app",
        unit: "cents",
        limit: { ...amount, value: 10000n },
        onExceed: "block",
        window: { kind: "calendar_month", timezone: "UTC" },
      },
      epoch: {
        epoch: "private-epoch",
        startsAt: "2026-10-01T00:00:00Z",
        endsAt: "2026-11-01T00:00:00Z",
      },
      used: amount,
      reserved: amount,
      remaining: { ...amount, value: 10000n },
    };
    m.budgets.mockResolvedValue({ outcome: "ok", value: [budget] });
    const data = await readMeteringAdmin({
      month: "2026-10",
      project: retained.id,
      actorId: "project-member",
    });
    expect(data.usage.rows).toEqual([]);
    expect(data.budgets[0].target).toBe("conn_retained");
    expect(data.references?.connections.conn_retained).toEqual({
      project: retained.name,
      provider: "serpapi",
    });
  });
  it.each([undefined, "", "unrelated-instance-admin"])(
    "keeps project names private without tenant access for actor %s",
    async (actorId) => {
      const data = await readMeteringAdmin({ month: "2026-10", project: retained.id, actorId });
      expect(data.references?.projects).toEqual({});
      expect(data.references?.connections.conn_retained).toEqual({
        project: retained.publicId,
        provider: "serpapi",
      });
      expect(data.usage.rows[0].dimensions.connection).toBe(retainedConnection.publicId);
      const serialized = JSON.stringify(data);
      expect(serialized).not.toContain(retained.name);
      expect(serialized).not.toContain("Project 0");
      expect(serialized).not.toContain(retainedConnection.id);
      expect(serialized).not.toContain(retained.ownerId);
      const nameQueries = m.projects.mock.calls.filter(([query]) => query.select?.name);
      expect(nameQueries).toHaveLength(actorId ? 1 : 0);
      if (actorId)
        expect(nameQueries[0][0].where.OR).toEqual([
          { ownerId: actorId },
          { members: { some: { userId: actorId } } },
        ]);
      expect(m.connections.mock.calls.every(([query]) => !query.select.project?.select.name)).toBe(
        true,
      );
    },
  );
  it.each(["project-member", retained.ownerId])(
    "shows names only for accessible candidates for %s",
    async (actorId) => {
      const data = await readMeteringAdmin({ month: "2026-10", project: null, actorId });
      expect(data.references?.projects).toEqual({ [retained.publicId]: retained.name });
      expect(data.references?.connections.conn_retained).toEqual({
        project: retained.name,
        provider: "serpapi",
      });
      expect(data.references?.projects).not.toHaveProperty(retained.id);
      expect(data.references?.projects).not.toHaveProperty("project-0");
      const nameQueries = m.projects.mock.calls.filter(([query]) => query.select?.name);
      expect(nameQueries).toHaveLength(1);
      expect(nameQueries[0][0].where.id.in).toContain(retained.id);
    },
  );
  it("does not invent labels for unavailable historical references", async () => {
    m.connections.mockResolvedValue([]);
    m.projects.mockResolvedValue([]);
    const data = await readMeteringAdmin({ month: "2026-10", project: null });
    expect(data.references).toEqual({ projects: {}, connections: {} });
    expect(data.usage.rows[0].dimensions.connection).toBe("");
  });
});
