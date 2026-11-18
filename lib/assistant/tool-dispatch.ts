import "server-only";
import {
  handleNativeSessionApiRequest,
  type NativeSessionPrincipal,
} from "@/lib/api/native-session";
import { mcpToolRestCall } from "@/lib/mcp/tools";
import { bindAssistantToolArgs } from "./tool-arguments";
import { findAssistantTool } from "./tool-policy";
import { safeAssistantToolResult } from "./tool-results";

/** Only read tools enter here. Writes require the separate persisted approval path. */
export async function dispatchAssistantReadTool(
  name: string,
  input: unknown,
  principal: NativeSessionPrincipal,
  projectPublicId: string,
  callId: string,
) {
  const entry = findAssistantTool(name);
  if (entry?.category !== "read")
    throw new Error("Assistant tool requires approval or is excluded");
  const args = bindAssistantToolArgs(input, projectPublicId);
  const rest = mcpToolRestCall(name, args);
  return dispatchBoundRestCall(rest, principal, projectPublicId, callId);
}

/** Internal transport: callers must first enforce read policy or claim an approved call. */
export async function dispatchBoundRestCall(
  rest: import("@/lib/mcp/rest-call").RestCall,
  principal: NativeSessionPrincipal,
  projectPublicId: string,
  callId: string,
) {
  const headers = new Headers({
    "x-bisibility-project": projectPublicId,
    "idempotency-key": `assistant-tool:${callId}`,
  });
  if (rest.preferAsync) headers.set("prefer", "respond-async");
  let body: string | undefined;
  if (rest.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(rest.body);
  }
  const url = new URL(`https://assistant.local/api/v1${rest.path}`);
  const path = url.pathname
    .replace(/^\/api\/v1\/?/, "")
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  const response = await handleNativeSessionApiRequest(
    new Request(url, { method: rest.method, headers, body }),
    path,
    principal,
  );
  const reader = response.body?.getReader();
  let text = "";
  if (reader) {
    const decoder = new TextDecoder();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        text += decoder.decode();
        break;
      }
      text += decoder.decode(chunk.value, { stream: true });
      if (text.length > 100000) {
        await reader.cancel();
        return {
          ok: response.ok,
          status: response.status,
          payload: { summary: "Result was too large to include." },
        };
      }
    }
  }
  let payload: unknown = text;
  if ((response.headers.get("content-type") ?? "").includes("json")) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { summary: "Invalid response." };
    }
  }
  return { ok: response.ok, status: response.status, payload: safeAssistantToolResult(payload) };
}
