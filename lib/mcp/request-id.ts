import { awaitWithSignal, withDeadline } from "@/lib/async/abort";
import { MCP_TOOL_NAMES } from "./canonical-tools";

const maxBodyBytes = 65_536;
const methods = new Set([
  "initialize",
  "ping",
  "tools/list",
  "tools/call",
  "notifications/initialized",
  "notifications/cancelled",
]);
const tools = new Set<string>(MCP_TOOL_NAMES);

/** Only protocol labels from the server's allowlists can reach diagnostics. */
export function mcpRequestMetadata(body: unknown) {
  const value =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { method?: unknown; params?: { name?: unknown } | null })
      : {};
  const rpcMethod =
    typeof value.method === "string" && methods.has(value.method) ? value.method : "unknown";
  const name = value.params?.name;
  const toolName =
    rpcMethod === "tools/call" && typeof name === "string" && tools.has(name) ? name : "unknown";
  return { rpcMethod, toolName };
}

type McpRequestMetadata = ReturnType<typeof mcpRequestMetadata> & { id: string | number | null };

/** Best-effort correlation only; validation and the original body stay with the SDK. */
export async function readMcpRequestId(req: Request): Promise<string | number | null> {
  return (await readMcpRequestMetadata(req)).id;
}

export async function readMcpRequestMetadata(req: Request): Promise<McpRequestMetadata> {
  const empty = { id: null, ...mcpRequestMetadata(null) };
  if (req.method.toUpperCase() !== "POST") return empty;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = req.clone().body?.getReader();
    if (!reader) return empty;
    const bodyReader = reader;
    const text = await withDeadline(undefined, 100, async (signal) => {
      const decoder = new TextDecoder();
      let bytes = 0;
      let text = "";
      for (;;) {
        const chunk = await awaitWithSignal(() => bodyReader.read(), signal);
        if (chunk.done) return text + decoder.decode();
        bytes += chunk.value.byteLength;
        if (bytes > maxBodyBytes) return "";
        text += decoder.decode(chunk.value, { stream: true });
      }
    });
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) return empty;
    const id = (body as { id?: unknown }).id;
    const safeId =
      (typeof id === "string" && id.length <= 256) ||
      (typeof id === "number" && Number.isSafeInteger(id))
        ? (id as string | number)
        : null;
    return { id: safeId, ...mcpRequestMetadata(body) };
  } catch {
    return empty;
  } finally {
    // Tee cancellation can wait on the SDK's branch, so do not await it.
    void reader?.cancel().catch(() => undefined);
  }
}
