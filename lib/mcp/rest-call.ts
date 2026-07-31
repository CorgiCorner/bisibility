import "server-only";

import type { ApiAuth } from "@/lib/api/auth";
import { handleApiRequest, handleMcpPreauthenticatedApiRequest } from "@/lib/api/router";

type RestMethod = "DELETE" | "GET" | "PATCH" | "POST";

export type RestCall = {
  body?: unknown;
  idempotencyKey?: string;
  method: RestMethod;
  path: string;
  preferAsync?: boolean;
  projectId?: string;
};

function routePath(url: URL) {
  return url.pathname
    .replace(/^\/api\/v1\/?/, "")
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
}

export type McpApiAuthorization = string | ApiAuth;

export async function dispatchMcpRestCall(rest: RestCall, authorization: McpApiAuthorization) {
  const headers = new Headers();
  if (typeof authorization === "string") {
    headers.set("authorization", `Bearer ${authorization}`);
  }
  let bodyInit: BodyInit | undefined;
  if (rest.body !== undefined) {
    headers.set("Content-Type", "application/json");
    bodyInit = JSON.stringify(rest.body);
  }
  if (rest.idempotencyKey) headers.set("Idempotency-Key", rest.idempotencyKey);
  if (rest.preferAsync) headers.set("Prefer", "respond-async");
  if (rest.projectId) headers.set("X-Bisibility-Project", rest.projectId);
  const url = new URL(`https://mcp.local/api/v1${rest.path}`);
  const request = new Request(url, { body: bodyInit, headers, method: rest.method });
  const path = routePath(url);
  const response =
    typeof authorization === "string"
      ? await handleApiRequest(request, path)
      : await handleMcpPreauthenticatedApiRequest(request, path, { auth: authorization });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("json") ? await response.json() : await response.text();
  return { ok: response.ok, payload, status: response.status };
}
