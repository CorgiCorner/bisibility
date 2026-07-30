import { resolveClientIp } from "@/lib/http/client-ip";

export const RESOLVED_CLIENT_IP_HEADER = "x-bisibility-resolved-client-ip";
export const AUTH_IP_ADDRESS_OPTIONS = {
  ipAddressHeaders: [RESOLVED_CLIENT_IP_HEADER],
};

export function withAuthClientIp(request: Request) {
  const headers = new Headers(request.headers);
  const clientIp = resolveClientIp(request.headers);

  // Always overwrite this client-controlled header to prevent forged rate-limit buckets;
  // without a trusted address, auth falls back to a shared per-path bucket.
  if (clientIp) {
    headers.set(RESOLVED_CLIENT_IP_HEADER, clientIp);
  } else {
    headers.delete(RESOLVED_CLIENT_IP_HEADER);
  }

  return new Request(request, { headers });
}
