import { resolve } from "node:path";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { releaseExpiredMigrationHoldsActivity } from "@/lib/temporal/maintenance-activities";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const integration = process.env.BISIBILITY_MIGRATION_HOLD_INTEGRATION === "1";

describe.runIf(integration)("self-host migration hold worker integration", () => {
  let environment: TestWorkflowEnvironment;
  let ownerId: string;
  let projectId: string;
  let projectPublicId: string;
  const taskQueue = `self-host-migration-${process.pid}`;

  beforeAll(async () => {
    vi.stubEnv("BISIBILITY_MIGRATION_HOLD_TTL_HOURS", "24");
    environment = await TestWorkflowEnvironment.createLocal();
    const owner = await prisma.user.create({
      data: {
        email: `self-host-migration-${process.pid}@example.com`,
        name: "Migration integration",
        publicId: makePublicId("usr"),
      },
    });
    ownerId = owner.id;
    const project = await prisma.project.create({
      data: {
        domain: "example.com",
        name: "Migration integration",
        ownerId,
        publicId: makePublicId("prj"),
        writeMode: "migration_hold",
        writeModeChangedAt: new Date(Date.now() - 25 * 60 * 60_000),
        writeModeChangedById: ownerId,
      },
    });
    projectId = project.id;
    projectPublicId = project.publicId;
  }, 120_000);

  afterAll(async () => {
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    await environment?.teardown();
    vi.unstubAllEnvs();
  });

  it("releases an expired hold through the real workflow and activity", async () => {
    const worker = await Worker.create({
      activities: { releaseExpiredMigrationHoldsActivity },
      connection: environment.nativeConnection,
      namespace: environment.client.options.namespace,
      taskQueue,
      workflowsPath: resolve(process.cwd(), "lib/temporal/workflows.ts"),
    });

    const result = await worker.runUntil(() =>
      environment.client.workflow.execute("releaseExpiredMigrationHoldsWorkflow", {
        taskQueue,
        workflowId: `self-host-migration-release-${process.pid}`,
      }),
    );

    expect(result).toEqual({ released: 1 });
    await expect(
      prisma.project.findUniqueOrThrow({
        select: { writeMode: true, writeModeChangedById: true },
        where: { id: projectId },
      }),
    ).resolves.toEqual({ writeMode: "active", writeModeChangedById: null });
    await expect(
      prisma.auditLog.findFirst({
        select: { action: true, actorId: true, targetId: true },
        where: { action: "project.migration_hold.auto_release", projectId },
      }),
    ).resolves.toEqual({
      action: "project.migration_hold.auto_release",
      actorId: null,
      targetId: projectPublicId,
    });
  }, 120_000);
});
