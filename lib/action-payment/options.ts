import "server-only";
import type { SerpProvider } from "@/lib/providers/types";
import type { ActionPaymentOption } from "./contract";
import { resolveProviderPayment } from "./provider-descriptor";
import { ActionPaymentError, paymentFingerprint } from "./token";

export const creditPaymentUnit = {
  kind: "credits",
  key: "credits",
  singular: "credit",
  plural: "credits",
} as const;
type Candidate = {
  connection: { publicId: string; credentialSource?: "own" | "hosted" };
  provider: Pick<SerpProvider, "id" | "label" | "payment" | "paymentFor">;
};
export function actionPaymentOption(
  { connection, provider }: Candidate,
  feature?: string,
): ActionPaymentOption | null {
  const descriptor = feature
    ? resolveProviderPayment(provider, feature)
    : provider.paymentFor
      ? null
      : provider.payment;
  if (!descriptor || !connection.credentialSource) return null;
  return {
    id: paymentFingerprint([
      connection.publicId,
      connection.credentialSource,
      feature ?? null,
      descriptor.unit,
    ]),
    connectionId: connection.publicId,
    providerId: provider.id,
    providerLabel: provider.label,
    fundingSource: connection.credentialSource === "hosted" ? "platform" : "byok",
    payableUnit: connection.credentialSource === "hosted" ? creditPaymentUnit : descriptor.unit,
  };
}
export function enumerateActionPaymentOptions(candidates: readonly Candidate[], feature?: string) {
  return candidates.flatMap((candidate) => {
    const option = actionPaymentOption(candidate, feature);
    return option ? [option] : [];
  });
}
export function selectActionPaymentCandidate<T extends Candidate>(
  candidates: readonly T[],
  connectionId?: string,
  paymentOptionId?: string,
  feature?: string,
): T | undefined {
  const candidate = paymentOptionId
    ? candidates.find((item) => actionPaymentOption(item, feature)?.id === paymentOptionId)
    : connectionId
      ? candidates.find((item) => item.connection.publicId === connectionId)
      : candidates[0];
  if (
    paymentOptionId &&
    (!candidate || (connectionId && candidate.connection.publicId !== connectionId))
  )
    throw new ActionPaymentError("payment_quote_changed");
  return candidate;
}
