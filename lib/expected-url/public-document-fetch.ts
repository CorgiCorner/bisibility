import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { resolveAllowedWebhookAddresses } from "@/lib/alerts/webhook-guard";
import { Agent, type Dispatcher, fetch as undiciFetch } from "undici";

export type PublicDocumentFetchOptions = {
  allowedHosts?: readonly string[];
  protocols?: readonly string[];
  fetcher?: (url: string, init: RequestInit & { dispatcher: Dispatcher }) => Promise<Response>;
  headers?: Record<string, string>;
  lookup?: (hostname: string) => Promise<LookupAddress[]>;
  maxBytes: number;
  timeoutMs: number;
  url: string;
  contentTypes?: readonly string[];
};

function allowedUrl(value: string, root: URL, options: PublicDocumentFetchOptions) {
  const url = new URL(value, root);
  if (
    !(options.protocols ?? ["https:"]).includes(url.protocol) ||
    url.username ||
    url.password ||
    (options.allowedHosts &&
      !options.allowedHosts.some((host) => host.toLowerCase() === url.hostname.toLowerCase()))
  ) {
    throw new Error("Document URL must use an allowed protocol and host without credentials.");
  }
  return url;
}

function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return Number(address.split(".")[0]) < 224;
  if (family !== 6) return false;
  try {
    const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    if (normalized.startsWith("ff")) return false;
    const embedded = /^::(?:ffff:)?([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(normalized);
    return !embedded || Number.parseInt(embedded[1], 16) >> 8 < 224;
  } catch {
    return false;
  }
}

function pinnedAgent(addresses: LookupAddress[]) {
  const pinned: LookupFunction = (_hostname, options, callback) => {
    if (options.all) {
      (callback as (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void)(
        null,
        addresses,
      );
    } else {
      (callback as (error: NodeJS.ErrnoException | null, address: string, family: number) => void)(
        null,
        addresses[0].address,
        addresses[0].family,
      );
    }
  };
  return new Agent({ connect: { lookup: pinned } });
}

async function withinDeadline<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error("Document fetch timed out."));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function cancelBody(response: Pick<Response, "body">) {
  void response.body?.cancel().catch(() => undefined);
}

async function readBody(response: Response, maxBytes: number, signal: AbortSignal) {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    cancelBody(response);
    throw new Error(`Document response exceeds ${maxBytes} bytes`);
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await withinDeadline(reader.read(), signal);
      if (part.done) break;
      length += part.value.byteLength;
      if (length > maxBytes) throw new Error(`Document response exceeds ${maxBytes} bytes`);
      chunks.push(part.value);
    }
    return Buffer.concat(chunks, length).toString("utf8");
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function fetchPublicDocument(options: PublicDocumentFetchOptions) {
  const root = new URL(options.url);
  let current = allowedUrl(root.href, root, options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const signal = controller.signal;
  try {
    for (let hop = 0; hop <= 3; hop++) {
      const vetted = await withinDeadline(
        resolveAllowedWebhookAddresses(current.href, {
          allowPrivateNetwork: false,
          resolveHost:
            options.lookup ?? ((hostname) => lookup(hostname, { all: true, verbatim: true })),
        }),
        signal,
      );
      if (!vetted.length || vetted.some(({ address }) => !isPublicAddress(address)))
        throw new Error("Document host has no public DNS addresses.");
      const dispatcher = pinnedAgent(
        vetted.map(({ address }) => ({ address, family: isIP(address) })),
      );
      try {
        const init = { dispatcher, redirect: "manual" as const, signal, headers: options.headers };
        const request = options.fetcher
          ? options.fetcher(current.href, init)
          : undiciFetch(current.href, init);
        const response = await withinDeadline(
          request.then((result) => {
            if (signal.aborted) {
              cancelBody(result as Response);
              throw new Error("Document fetch timed out.");
            }
            return result;
          }),
          signal,
        );
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          cancelBody(response as Response);
          const location = response.headers.get("location");
          if (!location || hop === 3) throw new Error("Document redirect limit reached.");
          current = allowedUrl(new URL(location, current).href, root, options);
          continue;
        }
        const contentType =
          response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
        if (!response.ok || (options.contentTypes && !options.contentTypes.includes(contentType))) {
          cancelBody(response as Response);
          throw new Error(
            response.ok
              ? "Unsupported document content type."
              : `Document fetch failed with HTTP ${response.status}`,
          );
        }
        // Both fetch implementations expose a standard web stream; only the dispatcher protocol differs.
        const body = await readBody(response as Response, options.maxBytes, signal);
        return { body, contentType, url: current.href };
      } finally {
        await dispatcher.destroy();
      }
    }
    throw new Error("Document redirect limit reached.");
  } finally {
    clearTimeout(timer);
  }
}
