import "server-only";
import type { ActionPaymentQuote } from "@/lib/action-payment/contract";
import type {
  DeploymentPaymentQuote,
  DeploymentPaymentQuoteInput,
  DeploymentPaymentRead,
  PaymentDatabase,
} from "@/lib/action-payment/paid-call";
export async function quoteDeploymentPayment(
  _input: DeploymentPaymentQuoteInput,
  _db?: PaymentDatabase,
): Promise<DeploymentPaymentQuote | null> {
  return null;
}
export async function assertDeploymentPayment(
  _operationKey: string,
  _authority: string,
  _db: PaymentDatabase,
) {
  throw new Error("Deployment payment unavailable");
}
export async function readDeploymentPayment(
  _operationKey: string,
): Promise<DeploymentPaymentRead | null> {
  return null;
}
export async function readDeploymentPaymentAvailability(_input: {
  projectId: string;
  actorId?: string | null;
  amount: string;
}): Promise<Pick<ActionPaymentQuote, "availability" | "wallet">> {
  return { availability: { allowed: false, reason: "payment_unavailable" } };
}
