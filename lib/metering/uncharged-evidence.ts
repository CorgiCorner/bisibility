import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ReserveInput } from "@usagekit/core";
import { meteringNamespace } from "./runtime";
import { shadowForProject } from "./shadow-runtime";
import { decode } from "./store/codec";
export async function recordUnchargedEvidence(id: string) {
  if (process.env.METERING_SHADOW !== "on") return;
  try {
    const row = await prisma.meteringOperation.findUnique({
      where: { namespace_operation_id: { namespace: meteringNamespace(), operation_id: id } },
      select: { input: true, created_at: true },
    });
    if (!row) return;
    const input = decode<ReserveInput>(row.input);
    if (!input.scope.group || input.source === "proxy") return;
    const shadow = await shadowForProject(input.scope.group);
    await shadow?.record({
      id,
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
