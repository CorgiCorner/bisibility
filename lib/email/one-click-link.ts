import {
  MANAGED_AUTHORIZATION_SERVER_ORIGIN,
  MANAGED_MCP_RESOURCE_ORIGIN,
} from "@/lib/deployment/mcp-origin-contract";

export function oneClickOrigin(origin: string) {
  const parsed = new URL(origin);
  const apex = new URL(MANAGED_MCP_RESOURCE_ORIGIN).hostname;
  if (
    process.env.DEPLOYMENT_MODE?.trim().toLowerCase() === "cloud" &&
    (parsed.hostname === apex || parsed.hostname === `www.${apex}`)
  )
    return MANAGED_AUTHORIZATION_SERVER_ORIGIN;
  return parsed.origin;
}

/** Turn a confirmation URL into the corresponding mailbox-provider endpoint. */
export function oneClickUnsubscribeUrl(
  confirmationUrl: string,
  stream: "marketing" | "achievement",
) {
  const confirmation = new URL(confirmationUrl);
  const token = confirmation.searchParams.get("token");
  if (!token) throw new Error("Unsubscribe token is missing.");
  const url = new URL("/api/email/unsubscribe/one-click", oneClickOrigin(confirmation.origin));
  url.searchParams.set("stream", stream);
  url.searchParams.set("token", token);
  return url.toString();
}
