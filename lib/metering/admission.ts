import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ProviderCredential, ProviderRequestSurface } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import type { ShadowComparison } from "./shadow-engine";
import { shadowForProject } from "./shadow-runtime";
export type AdmissionObservation = {
  connectionId: string;
  projectId: string;
  provider: string;
  surface: ProviderRequestSurface;
  estimatedCostCents: number;
  estimatedUsageQuantity?: number;
  /** Hosted observations compare platform funding so own and hosted stay distinguishable. */
  credentialSource?: "hosted";
  shadow?: { feature: string; source: ProviderRequestSource; credential?: ProviderCredential };
};
export async function compareAdmission(
  input: AdmissionObservation,
  legacy: ShadowComparison["legacy"],
) {
  if (!input.shadow || process.env.METERING_SHADOW !== "on") return;
  try {
    const shadow = await shadowForProject(input.projectId);
    if (!shadow) return;
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { ownerId: true },
    });
    if (!project) return;
    await shadow.compare(
      {
        id: crypto.randomUUID(),
        ownerId: project.ownerId,
        projectId: input.projectId,
        connectionId: input.connectionId,
        provider: input.provider,
        feature: input.shadow.feature,
        source: input.shadow.source,
        credentialKind: input.shadow.credential?.kind,
        credentialId: input.shadow.credential?.id,
        createdAt: new Date(),
        costCents: "0",
        usageQuantity: null,
        measurementStatus: "unknown",
        cached: false,
        failed: false,
        ...(input.credentialSource ? { credentialSource: input.credentialSource } : {}),
      },
      {
        cents: input.estimatedCostCents.toFixed(4),
        units: (input.estimatedUsageQuantity ?? 0).toFixed(6),
      },
      legacy,
    );
  } catch {
    console.warn("[metering] admission comparison failed", { projectId: input.projectId });
  }
}
