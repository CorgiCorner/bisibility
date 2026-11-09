const sensitive =
  /^(authorization|proxy_authorization|cookie|set_cookie|json_endpoint|raw_html_file|api_?key|key|login|password|client_?secret|client_?token|access_?token|refresh_?token|page_?token|token|secret|credentials|headers)$/i;
function safeUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    let changed = false;
    if (url.username || url.password) {
      changed = true;
      url.username = "";
      url.password = "";
    }
    for (const key of [...url.searchParams.keys()]) {
      if (sensitive.test(key.replaceAll("-", "_"))) {
        changed = true;
        url.searchParams.set(key, "[redacted]");
      }
    }
    return changed ? url.href : value;
  } catch {
    return value;
  }
}
function safeText(value: string) {
  return value
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]{8,}/gi, "$1 [redacted]")
    .replace(
      /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\s*[:=]\s*[^\s&<>'"]+/gi,
      "$1=[redacted]",
    )
    .replace(/https?:\/\/[^\s"'<>]+/gi, safeUrl);
}
/** Preserve complete JSON payloads, including large analytics pages, without recursive truncation. */
export function redactProviderResponse(input: unknown): unknown {
  const copies = new WeakMap<object, unknown>();
  const work: Array<{ source: object; target: Record<string, unknown> | unknown[] }> = [];
  const clone = (value: unknown): unknown => {
    if (typeof value === "string") return safeText(value);
    if (!value || typeof value !== "object") return value;
    if (copies.has(value)) return copies.get(value);
    const target: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
    copies.set(value, target);
    work.push({ source: value, target });
    return target;
  };
  const root = clone(input);
  for (let index = 0; index < work.length; index++) {
    const { source, target } = work[index];
    for (const [key, value] of Object.entries(source)) {
      const safe = sensitive.test(key.replaceAll("-", "_")) ? "[redacted]" : clone(value);
      Object.defineProperty(target, key, {
        value: safe,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return root;
}
/** Read a clone so the provider adapter still validates the original response. */
export async function captureHttpResponse(
  response: Response,
  capture?: (status: number, body: unknown, url?: string) => Promise<void>,
  url = response.url,
  maxBytes?: number,
) {
  if (!capture) return;
  const copy = response.clone();
  let text: string;
  if (maxBytes && copy.body) {
    const reader = copy.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await Promise.all([reader.cancel(), response.body?.cancel()]);
          throw new Error("Provider response exceeds its capture limit.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    text = new TextDecoder().decode(bytes);
  } else text = await copy.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* Preserve non-JSON provider failures too. */
  }
  await capture(response.status, body, url);
}
