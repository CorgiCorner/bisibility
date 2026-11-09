import type { AgentReport } from "@/lib/generated/prisma/client";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ row: null as AgentReport | null }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        agentReport: {
          create: async ({ data }: { data: AgentReport }) => {
            state.row = { ...data, id: "internal", createdAt: new Date() };
            return state.row;
          },
        },
        siteAuditRun: {
          create: async ({ data }: { data: object }) => ({
            ...data,
            createdAt: new Date(),
            state: "queued",
            pagesCrawled: 0,
            requests: 0,
          }),
        },
      }),
    agentReport: { findFirst: async () => state.row },
  },
}));
vi.mock("@/lib/operations/access-extension", () => ({ assertOperationAccess: vi.fn() }));

import { getAgentReport } from "@/lib/agent-reports/service";
import { domainSchema } from "@/lib/schemas/project";
import { createSiteAuditRun } from "./runs";

const domain = ["a".repeat(50), "b".repeat(50), "c".repeat(50), "example", "com"].join(".");
beforeEach(() => {
  state.row = null;
});
it.each(["queued", "complete"])(
  "round trips a valid long domain in a %s report",
  async (status) => {
    expect(domainSchema.safeParse(domain).success).toBe(true);
    const saved = await createSiteAuditRun({
      projectId: "project",
      actorId: null,
      domain,
      target: `https://${domain}/`,
      requestedPages: 10,
    });
    if (!state.row) throw new Error("Missing report");
    if (status === "complete") state.row.body = { ...saved.result, stopReason: "finished" };
    expect(state.row.title.length).toBeLessThanOrEqual(160);
    await expect(
      getAgentReport({ projectId: "project", reportId: saved.id }),
    ).resolves.toMatchObject({ body: { target: `https://${domain}/` } });
  },
);

it("validates the payload before inserting the report", async () => {
  await expect(
    createSiteAuditRun({
      projectId: "project",
      actorId: null,
      domain,
      target: `https://${domain}/${"a".repeat(300000)}`,
      requestedPages: 10,
    }),
  ).rejects.toThrow();
  expect(state.row).toBeNull();
});
