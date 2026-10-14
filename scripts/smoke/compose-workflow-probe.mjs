export const workflowProbe = `
const { prisma } = await import("file:///app/lib/db/prisma.ts");
const { closeRedisClient } = await import("file:///app/lib/redis/redis.ts");
const { encryptSecret } = await import("file:///app/lib/providers/crypto.ts");
const { configureHostDefinitionPolicy } = await import("file:///app/lib/measurement-definitions/host-policy-configuration.ts");
const { closeTemporalClient, getTemporalClient, runItemRankCheckWorkflowId } = await import(
  "file:///app/lib/temporal/client.ts"
);
const { previewRankCheckRun } = await import("file:///app/lib/rank-check/runs/preview.ts");
const { launchRankCheckRun } = await import("file:///app/lib/rank-check/runs/launch.ts");
const { claimQueuedRankCheckRun } = await import("file:///app/lib/rank-check/planner/queued-launch.ts");
const { rankCheckRunWorkflowGateway } = await import("file:///app/lib/temporal/rank-check-run-workflow-gateway.ts");

const phase = (value) => console.error("[compose-probe] " + value);
try {
  phase("fixture");
  if (process.env.BISIBILITY_FAKE_PROVIDER !== "1" || process.env.DEPLOYMENT_ENV !== "test") {
    throw new Error("Compose workflow fixture requires the isolated fake-provider environment.");
  }
  const keyword = await prisma.keyword.findFirst({ orderBy: { createdAt: "asc" } });
  if (!keyword) throw new Error("Demo seed did not create a keyword.");
  const connection = await prisma.providerConnection.findFirst({
    where: { projectId: keyword.projectId, provider: "dataforseo", credentialSource: "own", enabled: true, status: "connected" },
    select: { id: true },
  });
  if (!connection) throw new Error("Demo seed did not create the fake provider connection.");
  await prisma.providerConnection.update({
    where: { id: connection.id },
    data: { credentialsEncrypted: encryptSecret(JSON.stringify({ login: "compose-fixture", password: "compose-fixture" })) },
  });
  // Synthetic manual quote uses the same rate authority as preview and admission.
  await prisma.providerConnectionRate.upsert({
    where: { connectionId_feature: { connectionId: connection.id, feature: "rank_check" } },
    create: { connectionId: connection.id, feature: "rank_check", amountCents: "1.2345" },
    update: { amountCents: "1.2345" },
  });
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: keyword.projectId },
    select: { id: true, publicId: true, ownerId: true, domain: true, isSample: true, measurementPolicyEpoch: true },
  });
  // The isolated fake-provider fixture explicitly configures its own policy through real CAS and audit.
  await configureHostDefinitionPolicy(prisma, { actor: { id: project.ownerId } }, {
    projectId: project.publicId,
    expectedPolicyEpoch: project.measurementPolicyEpoch.toString(),
    manualTtlMs: null,
    cadenceGraceMs: null,
    confirmed: true,
  });
  const request = {
    project,
    providerId: "dataforseo",
    origin: { source: "app" },
    spec: { kind: "single", keywordId: keyword.publicId, v: 1 },
    trigger: "manual",
  };
  phase("preview");
  const preview = await previewRankCheckRun(request);
  if (preview.budget.blocked || preview.executable !== 1 || !preview.previewToken) {
    throw new Error("Compose run preview was not admitted.");
  }
  phase("launch");
  const launched = await launchRankCheckRun({
    ...request, actorId: project.ownerId, previewToken: preview.previewToken,
  });
  if ("outcome" in launched || launched.targetCount !== 1) {
    throw new Error("Compose launch did not create one owned target.");
  }
  const run = await prisma.rankCheckRun.findUniqueOrThrow({
    where: { publicId: launched.publicId },
    select: { id: true, orchestrationWorkflowId: true, items: { select: { id: true, keywordId: true } } },
  });
  if (run.items.length !== 1 || run.items[0].keywordId !== keyword.id || !run.orchestrationWorkflowId) {
    throw new Error("Compose run did not retain its selected keyword.");
  }
  // Use the same queued-run CAS and idempotent gateway as the product intent processor.
  phase("claim");
  await claimQueuedRankCheckRun({
    now: new Date(), runId: run.id, workflowId: run.orchestrationWorkflowId,
    startRun: rankCheckRunWorkflowGateway.startRun,
  }, prisma);
  // Another intent owner may hold the CAS just before its native Temporal start.
  phase("parent-visible");
  const parentDeadline = Date.now() + 30_000;
  while (!(await rankCheckRunWorkflowGateway.workflowExists(run.orchestrationWorkflowId))) {
    if (Date.now() >= parentDeadline) throw new Error("Compose run workflow was not observable before the deadline.");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const client = await getTemporalClient();
  phase("parent-result");
  await client.workflow.getHandle(run.orchestrationWorkflowId).result();
  const workflowId = runItemRankCheckWorkflowId(keyword.id, run.items[0].id);
  phase("child-result");
  const result = await client.workflow.getHandle(workflowId).result();
  if (result.deferred) throw new Error("Rank-check workflow was deferred: " + result.reason);
  const rankCheck = await prisma.rankCheck.findUnique({ where: { id: result.rankCheckId } });
  if (!rankCheck || rankCheck.status !== "completed" || rankCheck.runId !== run.id ||
      !rankCheck.definitionExecutionToken || !rankCheck.definitionExecutionPrincipal) {
    throw new Error("Rank-check workflow did not persist a completed result.");
  }
  phase("retained-result");
  const completedRun = await prisma.rankCheckRun.findUniqueOrThrow({
    where: { id: run.id },
    select: { status: true, outcome: true, targetCount: true, completedCount: true,
      items: { select: { id: true, keywordId: true, rankCheckId: true, status: true } } },
  });
  if (completedRun.status !== "completed" || completedRun.outcome !== "succeeded" ||
      completedRun.targetCount !== 1 || completedRun.completedCount !== 1 ||
      completedRun.items.length !== 1 || completedRun.items[0].id !== run.items[0].id ||
      completedRun.items[0].keywordId !== keyword.id || completedRun.items[0].rankCheckId !== rankCheck.id ||
      completedRun.items[0].status !== "completed") {
    throw new Error("Compose run did not finalize its completed owned target.");
  }
  console.log(
    JSON.stringify({
      keywordId: keyword.id,
      rankCheckId: rankCheck.id,
      status: rankCheck.status,
      workflowId,
      runId: run.id,
    }),
  );
} finally {
  phase("closing-clients");
  await Promise.all([closeRedisClient(), closeTemporalClient(), prisma.$disconnect()]);
  phase("clients-closed");
}
`;
