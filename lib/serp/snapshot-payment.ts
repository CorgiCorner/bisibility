import "server-only";

import type { AcceptedActionPayment } from "@/lib/action-payment/contract";
import { prepareActionPayment } from "@/lib/action-payment/session";
import { ActionPaymentError, paymentFingerprint } from "@/lib/action-payment/token";
import { prisma } from "@/lib/db/prisma";
import { hostedRankCheckEstimatedCostCents } from "@/lib/providers/execution-extension";
import { serpApiProvider } from "@/lib/providers/serp/serpapi";
import { readSnapshotContinuation, readSnapshotExtension } from "./snapshot-extension-state";
import { loadSnapshotExtensionView } from "./snapshot-extension-view";

export type SnapshotPaymentInput = {
  actorId: string;
  projectId: string;
  checkId: string;
  nextStart: number;
  paymentOptionId?: string;
  acceptedPayment?: AcceptedActionPayment;
};

/** The continuation is a separate purchase on the original connection, never a fallback. */
export async function prepareSnapshotExtensionPayment(
  input: SnapshotPaymentInput,
  requirePayment: boolean,
) {
  const check = await prisma.rankCheck.findFirst({
    where: {
      publicId: input.checkId,
      keyword: { projectId: input.projectId },
      status: "completed",
    },
    select: { provider: true, raw: true },
  });
  if (!check) return { ok: false as const, reason: "unavailable" as const };
  const view = await loadSnapshotExtensionView({ ...input, ...check });
  if (view.reason !== "available" && view.reason !== "not_sent")
    return { ok: false as const, reason: view.reason };
  const context = readSnapshotContinuation(check.raw);
  const state = context && readSnapshotExtension(check.raw, context);
  if (!context?.connectionId || !state || state.nextStart !== input.nextStart)
    return { ok: false as const, reason: "unavailable" as const };
  const connection = await prisma.providerConnection.findFirst({
    where: {
      id: context.connectionId,
      projectId: input.projectId,
      provider: "serpapi",
      kind: "serp",
      credentialSource: { in: ["own", "hosted"] },
      enabled: true,
      status: "connected",
    },
    select: {
      id: true,
      publicId: true,
      provider: true,
      credentialSource: true,
      credentialsEncrypted: true,
      project: { select: { ownerId: true } },
    },
  });
  if (!connection) return { ok: false as const, reason: "disconnected" as const };
  const scope = { checkId: input.checkId, context, nextStart: input.nextStart };
  const costCents =
    connection.credentialSource === "hosted"
      ? await hostedRankCheckEstimatedCostCents("serpapi", 10)
      : 0;
  if (costCents === null) throw new ActionPaymentError("payment_unavailable");
  const payment = await prepareActionPayment({
    ...input,
    requirePayment,
    ownerId: connection.project.ownerId,
    source: "app",
    feature: "rank_check",
    request: { operation: "snapshot_extension", ...scope },
    connection,
    provider: serpApiProvider,
    children: [{ key: "snapshot-page", costCents, quantity: 1, cached: false }],
  });
  if (!payment) throw new ActionPaymentError("payment_unavailable");
  if (view.expiresAt) {
    payment.quote.expiresAt = new Date(
      Math.min(Date.parse(payment.quote.expiresAt), Date.parse(view.expiresAt)),
    ).toISOString();
  }
  return { ok: true as const, payment, scopeHash: paymentFingerprint(scope) };
}

export function assertSnapshotPaymentScope(
  scopeHash: string,
  scope: { checkId: string; context: unknown; nextStart: number },
) {
  if (scopeHash !== paymentFingerprint(scope))
    throw new ActionPaymentError("payment_quote_changed");
}
