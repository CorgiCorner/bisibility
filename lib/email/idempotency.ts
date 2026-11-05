export const RESEND_PAYLOAD_MISMATCH = "invalid_idempotent_request";
export const RESEND_CONCURRENT_REQUEST = "concurrent_idempotent_requests";

export function describeEmailTransport(providerId: string | null) {
  if (!providerId) return null;
  return { id: providerId, idempotent: providerId === "resend" };
}
