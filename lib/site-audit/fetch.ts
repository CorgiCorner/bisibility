import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import type { LookupFunction } from "node:net";
import {
  resolveAllowedWebhookAddresses,
  type WebhookResolvedAddress,
} from "@/lib/alerts/webhook-guard";
import { Agent, type Dispatcher } from "undici";
import { sameOriginAuditUrl } from "./target";

export const MAX_PAGE_BYTES = 524_288;
export const MAX_REQUESTS = 20;
export const MAX_DURATION_MS = 15_000;
export type AuditTransport = {
  fetch?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<WebhookResolvedAddress[]>;
  now?: () => number;
};
export type CrawlBudget = {
  deadline: number;
  requests: number;
  origin: string;
  signal: AbortSignal;
  disallowed?: (url: URL) => boolean;
};

export class AuditRobotsDisallowedError extends Error {
  constructor(readonly url: string) {
    super("Crawl skipped because robots.txt disallows this URL.");
    this.name = "AuditRobotsDisallowedError";
  }
}

function pinnedAgent(vetted: WebhookResolvedAddress[]) {
  const addresses: LookupAddress[] = vetted.map(({ address, family }) => ({
    address,
    family: family === 6 || address.includes(":") ? 6 : 4,
  }));
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

async function readBody(response: Response) {
  if (Number(response.headers.get("content-length")) > MAX_PAGE_BYTES) {
    await response.body?.cancel();
    throw new Error("Page exceeds the 512 KiB audit limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_PAGE_BYTES) throw new Error("Page exceeds the 512 KiB audit limit.");
      chunks.push(next.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function fetchAuditPage(
  url: URL,
  budget: CrawlBudget,
  transport: AuditTransport = {},
) {
  const now = transport.now ?? Date.now;
  const started = now();
  let current = url;
  for (let hop = 0; hop <= 3; hop++) {
    if (budget.disallowed?.(current)) throw new AuditRobotsDisallowedError(current.href);
    if (now() >= budget.deadline || budget.signal.aborted)
      throw new Error("Audit time limit reached.");
    if (budget.requests >= MAX_REQUESTS) throw new Error("Audit request limit reached.");
    // The timeout covers DNS and the pinned request. The audit never enables the webhook private-network escape hatch.
    const signal = AbortSignal.any([
      budget.signal,
      AbortSignal.timeout(Math.min(4000, Math.max(1, budget.deadline - now()))),
    ]);
    const resolveHost =
      transport.resolveHost ??
      ((hostname: string) => lookup(hostname, { all: true, verbatim: true }));
    let rejectAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(new Error("Audit time limit reached."));
      signal.addEventListener("abort", rejectAbort, { once: true });
      if (signal.aborted) rejectAbort();
    });
    let vetted: WebhookResolvedAddress[];
    try {
      vetted = await Promise.race([
        resolveAllowedWebhookAddresses(current.href, { allowPrivateNetwork: false, resolveHost }),
        aborted,
      ]);
    } finally {
      if (rejectAbort) signal.removeEventListener("abort", rejectAbort);
    }
    if (!vetted.length) throw new Error("Project domain has no public DNS addresses.");
    const dispatcher: Dispatcher = pinnedAgent(vetted);
    try {
      budget.requests++;
      const response = await (transport.fetch ?? fetch)(current, {
        dispatcher,
        redirect: "manual",
        signal,
        headers: { "User-Agent": "BisibilitySiteAudit/1.0", Accept: "text/html,text/plain;q=0.5" },
      } as RequestInit & { dispatcher: Dispatcher });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const next = sameOriginAuditUrl(
          response.headers.get("location") ?? "",
          current,
          budget.origin,
        );
        if (!next || !response.headers.get("location"))
          throw new Error("Redirect outside the project origin is blocked.");
        current = next;
        continue;
      }
      const html = await readBody(response);
      return {
        html,
        url: current.href,
        status: response.status,
        headers: response.headers,
        responseTimeMs: Math.max(0, now() - started),
      };
    } finally {
      await dispatcher.close();
    }
  }
  throw new Error("Page exceeds the three-redirect audit limit.");
}
