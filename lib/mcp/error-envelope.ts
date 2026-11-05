import { awaitWithSignal } from "@/lib/async/abort";
import { requestFailureContext } from "@/lib/observability/request-failure";

function correlationHeaders(): Record<string, string> {
  const id = requestFailureContext()?.correlationId;
  return id ? { "X-Bisibility-Request-Id": id } : {};
}

export function mcpFailureResponse(id: string | number | null, status: number) {
  const unavailable = status === 503;
  return Response.json(
    {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: unavailable ? "MCP dependency unavailable." : "MCP request failed.",
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...correlationHeaders(),
        ...(unavailable ? { "Retry-After": "2" } : {}),
      },
    },
  );
}

export async function normalizeMcpFailure(
  response: Response,
  id: string | number | null,
  signal: AbortSignal,
) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(correlationHeaders())) headers.set(name, value);
  headers.set("Cache-Control", "no-store");
  if (response.ok)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  headers.delete("Content-Length");
  headers.set("Content-Type", "application/json");
  let payload: unknown;
  try {
    payload = await awaitWithSignal(() => response.json(), signal);
  } catch {
    signal.throwIfAborted();
  }
  const body =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  if (body.jsonrpc === "2.0" && body.error) {
    return Response.json(body, { status: response.status, headers });
  }
  // Retain the legacy problem fields for clients already reading auth failures.
  return Response.json(
    {
      ...body,
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: typeof body.detail === "string" ? body.detail : "MCP request refused.",
        data: body,
      },
    },
    { status: response.status, headers },
  );
}
