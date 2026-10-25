import { randomUUID } from "node:crypto";
import { createAgentReport } from "@/lib/agent-reports/service";
import { auditTrackingCatalog } from "@/lib/api/ai-tracking-audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { Prisma } from "@/lib/generated/prisma/client";
import { Client } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptResearchedPrompts } from "./prompt-research-accept";

const url = process.env.METERING_TEST_DATABASE_URL;
const owners: string[] = [];
async function fixture(rowCount = 1) {
  const owner = await prisma.user.create({
    data: {
      publicId: makePublicId("usr"),
      name: "Research fixture",
      email: `${randomUUID()}@example.test`,
    },
  });
  owners.push(owner.id);
  const project = await prisma.project.create({
    data: {
      publicId: makePublicId("prj"),
      ownerId: owner.id,
      name: "Research fixture",
      domain: "example.test",
    },
  });
  const report = await createAgentReport({
    projectId: project.id,
    kind: "prompt_research",
    title: "Dataset",
    provenance: {
      evidence: "observed_dataset",
      scope: "provider_dataset_only",
      provider: "dataforseo",
      endpoint: "llm_mentions/search_mentions/live",
      providerRequestIds: ["fixture-request"],
    },
    body: {
      input: { keyword: "tools" },
      result: {
        evidence: "observed_dataset",
        fetchedAt: new Date().toISOString(),
        rows: Array.from({ length: rowCount }, (_, i) => ({
          prompt: `Question ${i}?`,
          model: "chat_gpt",
          answer: "Dataset answer",
          observedAt: null,
          brandMentioned: false,
          domainCited: false,
          citations: [],
        })),
      },
    },
  });
  const input = {
    reportId: report.id,
    rowIndices: Array.from({ length: rowCount }, (_, i) => i),
    topic: "Tools",
  };
  const audit = (
    resource: "topics" | "prompts",
    saved: { publicId: string },
    tx?: Prisma.TransactionClient,
  ) => auditTrackingCatalog({ id: owner.id }, project, resource, "POST", {}, saved, tx);
  return { owner, project, report, input, audit };
}

describe.skipIf(!url)("atomic research acceptance", () => {
  beforeEach(() => {
    const parsed = new URL(url ?? "");
    if (
      parsed.hostname !== "127.0.0.1" ||
      parsed.pathname !== "/credits_fixture" ||
      process.env.DEPLOYMENT_ENV !== "test"
    )
      throw new Error(
        "Research acceptance requires the owned loopback credits_fixture in test mode",
      );
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Unexpected provider request");
      }),
    );
  });
  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: owners } } });
    await prisma.user.deleteMany({ where: { id: { in: owners.splice(0) } } });
    vi.unstubAllGlobals();
  });
  afterAll(() => prisma.$disconnect());

  it("serializes concurrent acceptance before reading duplicates and preserves one trusted prompt", async () => {
    const f = await fixture();
    const blocker = new Client({ connectionString: url });
    await blocker.connect();
    let calls: Promise<unknown>[] = [];
    try {
      const {
        rows: [{ pid }],
      } = await blocker.query("SELECT pg_backend_pid() AS pid");
      await blocker.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [f.project.id]);
      calls = [
        acceptResearchedPrompts(f.project.id, f.input, f.audit),
        acceptResearchedPrompts(f.project.id, f.input, f.audit),
      ];
      await expect
        .poll(
          async () => {
            const { rows } = await blocker.query(
              "SELECT count(*)::int AS waiting FROM pg_stat_activity a WHERE $1=ANY(pg_blocking_pids(a.pid))",
              [pid],
            );
            return rows[0].waiting;
          },
          { timeout: 4000, interval: 10 },
        )
        .toBe(2);
      await blocker.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [f.project.id]);
      const result = (await Promise.all(calls)) as Array<{ added: number }>;
      expect(result.map((r) => r.added).sort()).toEqual([0, 1]);
      expect(await prisma.aiTopic.count({ where: { projectId: f.project.id } })).toBe(1);
      const prompts = await prisma.aiPrompt.findMany({
        where: { projectId: f.project.id },
        include: { revisions: true },
      });
      expect(prompts).toHaveLength(1);
      expect(prompts[0].revisions[0].provenance).toMatchObject({
        method: "provider_dataset",
        reportId: f.report.id,
        rowIndex: 0,
      });
      expect(await prisma.auditLog.count({ where: { projectId: f.project.id } })).toBe(2);
      expect((await acceptResearchedPrompts(f.project.id, f.input, f.audit)).added).toBe(0);
      expect(await prisma.auditLog.count({ where: { projectId: f.project.id } })).toBe(2);
    } finally {
      await blocker.query("SELECT pg_advisory_unlock_all()");
      await blocker.end();
      await Promise.allSettled(calls);
    }
  });

  it("rolls back the complete batch and audits when an audit callback fails", async () => {
    const f = await fixture();
    await expect(
      acceptResearchedPrompts(f.project.id, f.input, async (resource, saved, tx) => {
        await f.audit(resource, saved, tx);
        if (resource === "prompts") throw new Error("Audit failed");
      }),
    ).rejects.toThrow("Audit failed");
    expect(await prisma.aiTopic.count({ where: { projectId: f.project.id } })).toBe(0);
    expect(await prisma.aiPrompt.count({ where: { projectId: f.project.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { projectId: f.project.id } })).toBe(0);
  });

  it("rolls back earlier rows, the new topic and audits when a later row exceeds quota", async () => {
    const f = await fixture(2);
    await prisma.aiPrompt.createMany({
      data: Array.from({ length: 99 }, () => ({
        projectId: f.project.id,
        publicId: makePublicId("aip"),
      })),
    });
    await expect(acceptResearchedPrompts(f.project.id, f.input, f.audit)).rejects.toThrow("limit");
    expect(await prisma.aiTopic.count({ where: { projectId: f.project.id } })).toBe(0);
    expect(await prisma.aiPrompt.count({ where: { projectId: f.project.id } })).toBe(99);
    expect(await prisma.auditLog.count({ where: { projectId: f.project.id } })).toBe(0);
  });

  it("rejects cross-project evidence without catalog or audit writes", async () => {
    const a = await fixture();
    const b = await fixture();
    await expect(acceptResearchedPrompts(b.project.id, a.input, b.audit)).rejects.toThrow(
      "report not found",
    );
    expect(await prisma.aiTopic.count()).toBe(0);
    expect(await prisma.aiPrompt.count()).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { projectId: { in: [a.project.id, b.project.id] } } }),
    ).toBe(0);
  });
});
