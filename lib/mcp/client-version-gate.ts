import "server-only";

import { type ClientAttribution, parseClientAttribution } from "@/lib/analytics/client-attribution";
import { prisma } from "@/lib/db/prisma";
import { setRequestDiagnosticAttribute } from "@/lib/observability/request-diagnostics";
import { readMcpRequestId } from "./request-id";

/** Plugin market index that lists every released DSH plugin version. */
export const DSH_PLUGIN_UPDATE_URL =
  "https://corgicorner.github.io/bisibility-dsh-plugin/index.json";

/**
 * DSH plugin 0.1.0 predates the client header. It registers its OAuth client under this name,
 * so while a floor is set, header-less traffic from such a client counts as that version.
 */
export const LEGACY_DSH_PLUGIN_CLIENT_NAME = "DeepSeek Harness";
export const LEGACY_DSH_PLUGIN_VERSION = "0.1.0";

/** Server-defined JSON-RPC error code for a client below the supported floor. */
export const UPDATE_REQUIRED_ERROR_CODE = -32010;

export type McpClient = {
  client: ClientAttribution["client"];
  version?: string;
  inferred: boolean;
};

const floorPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const warnedFloors = new Set<string>();

/** The configured DSH plugin floor, or null when unset or not an exact X.Y.Z version. */
export function dshPluginMinVersion(configured = process.env.DSH_PLUGIN_MIN_VERSION) {
  const value = configured?.trim();
  if (!value) return null;
  if (floorPattern.test(value)) return value;
  if (!warnedFloors.has(value)) {
    warnedFloors.add(value);
    // A malformed floor must not lock every plugin user out; the gate stays open.
    console.warn("DSH_PLUGIN_MIN_VERSION is not an X.Y.Z version; the MCP client floor is off.");
  }
  return null;
}

function identifiers(value: string) {
  return value.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

/** SemVer precedence of two valid versions: negative, zero or positive. */
export function compareVersions(left: string, right: string) {
  const [leftCore, leftPre] = left.split("+")[0].split(/-(.*)/s);
  const [rightCore, rightPre] = right.split("+")[0].split(/-(.*)/s);
  const a = leftCore.split(".").map(Number);
  const b = rightCore.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  if (!leftPre || !rightPre) return (leftPre ? -1 : 0) + (rightPre ? 1 : 0);
  const x = identifiers(leftPre);
  const y = identifiers(rightPre);
  for (let index = 0; index < Math.max(x.length, y.length); index += 1) {
    if (x[index] === undefined) return -1;
    if (y[index] === undefined) return 1;
    if (x[index] === y[index]) continue;
    if (typeof x[index] === "number" && typeof y[index] === "number")
      return (x[index] as number) - (y[index] as number);
    if (typeof x[index] === "number") return -1;
    if (typeof y[index] === "number") return 1;
    return String(x[index]) < String(y[index]) ? -1 : 1;
  }
  return 0;
}

const clientNames = new Map<string, string | null>();
const clientNameCacheLimit = 500;

async function oauthClientName(clientId: string) {
  if (clientNames.has(clientId)) return clientNames.get(clientId) ?? null;
  const client = await prisma.oauthClient.findUnique({
    select: { name: true },
    where: { clientId },
  });
  if (clientNames.size >= clientNameCacheLimit) clientNames.clear();
  clientNames.set(clientId, client?.name ?? null);
  return client?.name ?? null;
}

export function resetMcpClientNameCacheForTests() {
  clientNames.clear();
}

/**
 * Identify the MCP caller from `X-Bisibility-Client`. Without the header, an OAuth client named
 * like DSH plugin 0.1.0 is looked up only while a floor is set, so default traffic costs nothing.
 */
export async function resolveMcpClient(
  headers: Headers,
  oauthClientId: string | undefined,
  minVersion: string | null,
  lookupName: (clientId: string) => Promise<string | null> = oauthClientName,
): Promise<McpClient> {
  if (headers.has("x-bisibility-client")) {
    const attribution = parseClientAttribution(headers, "oauth");
    return {
      client: attribution.client,
      inferred: false,
      ...(attribution.client_version ? { version: attribution.client_version } : {}),
    };
  }
  if (minVersion && oauthClientId) {
    if ((await lookupName(oauthClientId)) === LEGACY_DSH_PLUGIN_CLIENT_NAME) {
      return { client: "dsh_plugin", version: LEGACY_DSH_PLUGIN_VERSION, inferred: true };
    }
  }
  return { client: "unknown", inferred: false };
}

/** Record the caller on the active request's diagnostics without affecting the response. */
export function recordMcpClient(client: McpClient) {
  try {
    setRequestDiagnosticAttribute("mcp.client", client.client);
    if (client.version) setRequestDiagnosticAttribute("mcp.client_version", client.version);
    if (client.inferred) setRequestDiagnosticAttribute("mcp.client_inferred", "true");
  } catch {
    // Optional diagnostics must not change the MCP response.
  }
}

/** Whether the floor refuses this caller. A DSH plugin without a readable version is refused. */
export function isBelowDshPluginFloor(client: McpClient, minVersion: string | null) {
  if (!minVersion || client.client !== "dsh_plugin") return false;
  return !client.version || compareVersions(client.version, minVersion) < 0;
}

/** A `426` JSON-RPC error that tells the plugin and its user which version to install. */
export async function updateRequiredResponse(
  req: Request,
  client: McpClient,
  minVersion: string,
  id?: string | number | null,
) {
  const current = client.version ?? "unknown";
  return Response.json(
    {
      jsonrpc: "2.0",
      id: id === undefined ? await readMcpRequestId(req) : id,
      error: {
        code: UPDATE_REQUIRED_ERROR_CODE,
        message: `Bisibility no longer accepts version ${current} of the DSH plugin. Update it to ${minVersion} or newer on the DeepSeek Harness Plugins page, then reload the page.`,
        data: { clientVersion: current, minVersion, updateUrl: DSH_PLUGIN_UPDATE_URL },
      },
    },
    {
      status: 426,
      headers: { "Cache-Control": "no-store", "X-Bisibility-Min-Version": minVersion },
    },
  );
}
