import "server-only";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import type { ProviderUsageReceipt } from "@/lib/providers/usage";
import { ownAdmission } from "./admission-extension";
import { persistByokEvidence } from "./byok-evidence-storage";
import { ownAllocationTag } from "./credential-version";
import { PROVIDER_REQUEST_SOURCES, type ProviderRequestAttribution } from "./tag";

export { loadByokEvidence } from "./byok-evidence-storage";

type EvidenceClient = Pick<PrismaClient, "meteringUsageEvidence">;
export type ByokEvidenceInput = {
  attribution: ProviderRequestAttribution;
  connectionId: string;
  projectId: string;
  provider: string;
  unit: "cents" | "units";
  estimate?: { cents: string; units: string };
  credentialVersion?: string | null;
};

/** Only trusted pre-I/O project/connection rows may assign a new accounting principal. */
export async function captureByokEvidence(
  tx: Prisma.TransactionClient,
  input: ByokEvidenceInput,
  id: string,
  at?: Date,
) {
  const context = input.attribution.context;
  if (context.projectId !== input.projectId || !PROVIDER_REQUEST_SOURCES.includes(context.source))
    throw new Error("BYOK accounting attribution is invalid.");
  await tx.$queryRaw`SELECT id FROM projects WHERE id=${input.projectId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${input.connectionId} FOR UPDATE`;
  const now = at ?? new Date();
  const project = await tx.project.findUnique({
    where: { id: input.projectId },
    select: { ownerId: true },
  });
  const connection = await tx.providerConnection.findUnique({
    where: { id: input.connectionId },
    select: { projectId: true, provider: true, credentialSource: true, publicId: true },
  });
  if (
    !project ||
    connection?.projectId !== input.projectId ||
    connection.provider !== input.provider ||
    connection.credentialSource !== "own"
  )
    throw new Error("BYOK accounting connection changed before dispatch.");
  return tx.meteringUsageEvidence.create({
    data: {
      id,
      namespace: meteringNamespace(),
      principal: project.ownerId,
      projectId: input.projectId,
      connectionId: input.connectionId,
      provider: input.provider,
      feature: context.feature,
      source: context.source,
      credentialKind: input.attribution.credential?.kind ?? null,
      credentialId: input.attribution.credential?.id ?? null,
      correlationId: context.correlationId,
      unit: input.unit,
      estimate: {
        ...(input.estimate ?? { cents: "0", units: "1" }),
        credentialVersion: input.credentialVersion ?? null,
        allocationTag: ownAllocationTag(input.provider, input.connectionId),
        publicConnectionId: connection.publicId ?? null,
      },
      createdAt: now,
    },
  });
}

export async function recordByokEvidence(
  tx: Prisma.TransactionClient,
  id: string,
  receipt: ProviderUsageReceipt,
  canonicalId: string | null,
) {
  await persistByokEvidence(tx, id, receipt, canonicalId);
  await ownAdmission.acknowledge(tx, id);
}

export async function discardByokEvidence(db: EvidenceClient, ids: readonly string[]) {
  await db.meteringUsageEvidence.updateMany({
    where: { id: { in: [...ids] }, measurementStatus: "unknown" },
    data: { discarded: true },
  });
}
