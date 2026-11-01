import "server-only";
import { recordConnectionAccountFailure } from "./account-failure";

export function recordConnectionPaymentFailure(input: {
  connectionId: string;
  projectId: string;
  credentialVersion: string | null;
}) {
  return recordConnectionAccountFailure({
    ...input,
    provider: "dataforseo",
    httpStatus: 402,
    fact: { kind: "failure", code: "provider_billing", scope: { kind: "account" } },
  });
}
