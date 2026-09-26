import "server-only";

import { prisma } from "@/lib/db/prisma";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { surfaceOf } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import type { SerpDepth } from "@/lib/serp/constants";
import { assertBudgetAvailable } from "./budget";
import { estimatedRankCheckCostCents } from "./default-cost";
import type { RankCheckConnectionInput } from "./runner";

type PreflightInput = {
  connection: RankCheckConnectionInput | undefined;
  reservationConnection?: RankCheckConnectionInput;
  depth: SerpDepth;
  keywordId: string;
  now: Date;
  projectId: string;
  rankCheckId?: string;
  source: ProviderRequestSource;
};

export async function assertLegacyLiveBudget(input: PreflightInput): Promise<void> {
  const connection = input.connection;
  await prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, input.projectId);
    const project = await tx.project.findUnique({
      select: { budgetCapCents: true, providerAllocationsInitializedAt: true },
      where: { id: input.projectId },
    });
    const current = connection?.id
      ? await tx.providerConnection.findUnique({
          select: { credentialSource: true, projectId: true, provider: true },
          where: { id: connection.id },
        })
      : null;
    if (
      connection?.id &&
      (current?.projectId !== input.projectId ||
        current.provider !== connection.provider ||
        current.credentialSource !== "own")
    ) {
      throw new ProviderUsagePersistenceError({
        cause: new Error("Provider connection mismatch."),
      });
    }
    if (!project)
      throw new ProviderUsagePersistenceError({ cause: new Error("Project not found.") });
    if (project?.providerAllocationsInitializedAt) return;
    if (input.rankCheckId) {
      await tx.$queryRaw`
        SELECT id FROM rank_checks WHERE id = ${input.rankCheckId} FOR UPDATE
      `;
      const check = await tx.rankCheck.findUnique({
        select: {
          keywordId: true,
          provider: true,
          status: true,
          runItem: {
            select: {
              run: {
                select: { projectId: true, selectionKind: true, selectionSpec: true, source: true },
              },
            },
          },
        },
        where: { id: input.rankCheckId },
      });
      const run = check?.runItem?.run;
      const selection = run?.selectionSpec as
        | { providerConnectionId?: unknown; rankReservationPrices?: unknown }
        | undefined;
      // Legacy own-credential runs have no connection binding until allocations are initialized.
      const legacyUnbound =
        selection?.providerConnectionId == null && selection?.rankReservationPrices == null;
      const validRun =
        !run ||
        (run.projectId === input.projectId &&
          (run.source ?? "app") === input.source &&
          surfaceOf(run.source as ProviderRequestSource | null) === surfaceOf(input.source) &&
          (legacyUnbound ||
            selection?.providerConnectionId === (input.reservationConnection ?? connection)?.id));
      if (
        check?.status !== "running" ||
        check.keywordId !== input.keywordId ||
        (check.provider !== "primary" &&
          check.provider !== (input.reservationConnection ?? connection)?.provider) ||
        !validRun
      ) {
        throw new ProviderUsagePersistenceError({ cause: new Error("Rank reservation mismatch.") });
      }
    }
    await assertBudgetAvailable(input.projectId, input.now, {
      capCents: project.budgetCapCents,
      client: tx,
      estimatedCostCents: estimatedRankCheckCostCents(
        connection?.provider,
        input.depth,
        connection?.costPerCheckCents,
        connection?.rateContext ?? LIST_PROVIDER_RATE_CONTEXT,
      ),
      excludeRankCheckId: input.rankCheckId,
    });
  });
}
