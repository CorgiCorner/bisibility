export const MANAGED_MCP_RESOURCE_ORIGIN = "https://bisibility.com";
export const MANAGED_AUTHORIZATION_SERVER_ORIGIN = "https://eu.bisibility.com";
export const MANAGED_MCP_RESOURCE_URL = `${MANAGED_MCP_RESOURCE_ORIGIN}/api/mcp`;

type McpOriginEnvironment = {
  [key: string]: string | undefined;
  DEPLOYMENT_ENV?: string;
  DEPLOYMENT_MODE?: string;
};

export function normalizeAuthorizationServerOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Authorization server must use HTTP or HTTPS.");
  }
  return url.origin;
}

export function isManagedProduction(env: McpOriginEnvironment = process.env) {
  return (
    env.DEPLOYMENT_MODE?.trim().toLowerCase() === "cloud" &&
    env.DEPLOYMENT_ENV?.trim().toLowerCase() === "production"
  );
}

export function resolveMcpResourceUrl(
  authorizationServer: string,
  env: McpOriginEnvironment = process.env,
) {
  return isManagedProduction(env)
    ? MANAGED_MCP_RESOURCE_URL
    : new URL("/api/mcp", authorizationServer).toString();
}

export function protectedResourceMetadataUrl(resourceUrl: string) {
  const resource = new URL(resourceUrl);
  const resourcePath = resource.pathname === "/" ? "" : resource.pathname.replace(/\/$/, "");
  resource.pathname = `/.well-known/oauth-protected-resource${resourcePath}`;
  resource.search = "";
  resource.hash = "";
  return resource.toString();
}
