import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ownAdmission } from "@/lib/provider-usage/admission-extension";
import { loadByokEvidence } from "@/lib/provider-usage/byok-evidence";
import type { ReserveInput } from "@usagekit/core";
import { shadowForProject } from "./shadow-runtime";
import { decode } from "./store/codec";
export async function recordUnchargedEvidence(id: string) {
  if (process.env.METERING_SHADOW !== "on") return;
  try {
    if (await ownAdmission.owns(prisma, id)) return;
    const retained = await loadByokEvidence(prisma, id);
    if (retained?.measurementStatus === "recorded") {
      const shadow = await shadowForProject(retained.projectId, retained.namespace);
      await shadow?.record(retained);
      return;
    }
    const evidence = await prisma.meteringUsageEvidence.findUnique({
      where: { id },
      select: { namespace: true },
    });
    if (!evidence?.namespace) return;
    const row = await prisma.meteringOperation.findUnique({
      where: { namespace_operation_id: { namespace: evidence.namespace, operation_id: id } },
      select: { input: true, created_at: true },
    });
    if (!row) return;
    const input = decode<ReserveInput>(row.input);
    if (!input.scope.group || input.source === "proxy" || input.source === "import") return;
    const shadow = await shadowForProject(input.scope.group, input.scope.namespace);
    await shadow?.record({
      id,
      namespace: input.scope.namespace,
      projectId: input.scope.group,
      ownerId: input.scope.principal,
      connectionId: input.scope.connection,
      provider: input.provider,
      feature: input.operation,
      source: input.source,
      createdAt: row.created_at,
      costCents: "0",
      usageQuantity: "0",
      measurementStatus: "recorded",
      cached: false,
      failed: false,
    });
  } catch {
    console.warn("[metering] uncharged evidence failed", { operationId: id });
  }
}
