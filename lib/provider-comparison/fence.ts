import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { NativeRequestGuard, PaidFenceHook } from "@/lib/metering/paid-attempt-types";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { assertComparisonAccess } from "./access";
import type { FrozenComparison } from "./model";
import { comparisonRequestKey } from "./request";
export function comparisonFences(input: {
  projectId: string;
  runId: string;
  sideId: string;
  token: string;
  actorId: string | null;
  snapshot: FrozenComparison;
  connection: FrozenComparison["connections"][number];
  tag: string;
}) {
  async function check(tx: Prisma.TransactionClient) {
    await assertComparisonAccess(tx, input.projectId, input.actorId, true);
    await tx.$queryRaw`SELECT id FROM provider_comparison_sides WHERE id=${input.sideId} AND "projectId"=${input.projectId} FOR UPDATE`;
    const side = await tx.providerComparisonSide.findFirst({
      where: { id: input.sideId, projectId: input.projectId, runId: input.runId },
      include: { run: true },
    });
    if (
      side?.status !== "claimed" ||
      side.claimToken !== input.token ||
      side.run.cancellationRequested ||
      side.provider !== input.connection.provider ||
      side.connectionId !== input.connection.id
    )
      throw new Error("Comparison execution custody changed.");
    const keyword = await tx.keyword.findFirst({
      where: { id: input.snapshot.keywordId, projectId: input.projectId, archivedAt: null },
      include: { locationRef: true, project: { select: { domain: true } } },
    });
    if (
      !keyword ||
      keyword.text !== input.snapshot.text ||
      keyword.device !== input.snapshot.device ||
      keyword.locationId !== input.snapshot.locationId ||
      keyword.project.domain !== input.snapshot.domain ||
      ["gl", "hl", "primaryGeoCode", "primaryGeoName", "secondaryGeoName"].some(
        (key) =>
          keyword.locationRef[key as keyof typeof keyword.locationRef] !==
          input.snapshot.location[key as keyof typeof input.snapshot.location],
      )
    )
      throw new Error("Comparison keyword scope changed.");
    const connection = await tx.providerConnection.findFirst({
      where: { id: input.connection.id, projectId: input.projectId },
    });
    if (
      !connection?.enabled ||
      connection.status !== "connected" ||
      connection.provider !== input.connection.provider ||
      connection.credentialSource !== input.connection.fundingSource ||
      connection.updatedAt.toISOString() !== input.connection.revision ||
      ownCredentialVersion(connection.provider, connection.id, connection.credentialsEncrypted) !==
        input.connection.credentialVersion
    )
      throw new Error("Comparison connection changed.");
    return side;
  }
  const beforeReserve: NativeRequestGuard = {
    async lockBusiness(tx) {
      await check(tx);
    },
    async assertRequest(tx, operationId, request) {
      const side = await check(tx);
      const key = comparisonRequestKey(
        input.connection.provider,
        input.snapshot,
        request,
        input.tag,
      );
      if (side.requestKeys.includes(key))
        throw new Error(
          "Comparison native request was already admitted; reconcile instead of rebuying.",
        );
      await tx.providerComparisonSide.update({
        where: { id: side.id },
        data: { requestKeys: { push: key }, attemptIds: { push: operationId } },
      });
    },
  };
  const beforeFence: PaidFenceHook = {
    async lockBusiness(tx) {
      await check(tx);
    },
    async assertDispatch(tx, references) {
      const side = await check(tx);
      if (
        !references.length ||
        references.some(
          ({ context, operation }) =>
            context.projectId !== input.projectId ||
            context.connectionId !== input.connection.id ||
            context.correlationId !== `comparison:${input.sideId}` ||
            !side.attemptIds.includes(operation.operationId),
        )
      )
        throw new Error("Comparison accounting custody changed.");
    },
  };
  return { beforeReserve, beforeFence };
}
