import "server-only";
import { createHash } from "node:crypto";
import { normalizeDomain } from "@/lib/domains/normalize";
import { locationForProvider } from "@/lib/rank-check/fallback-location";
import { serpRankLocation } from "@/lib/serp/location";
import type { ProviderRequest } from "@usagekit/providers";
import { sameDefinitionBytes } from "./canonical";
import { DefinitionUnavailableError } from "./errors";
import type { DefinitionBinding, DefinitionTransaction } from "./model";

export type NativeDefinitionRequestProof = Readonly<{
  version: 1;
  route: "live" | "queued";
  requestedDepth: number;
  pageStart: number | null;
  pageSize: number | null;
  nativeDepth: number | null;
  priority: 1 | 2 | null;
  fingerprint: string;
}>;
/** Actual credential-free native request, not requested depth/item count interpreted as a complete prefix. */
export function nativeDefinitionRequestProof(
  binding: DefinitionBinding,
  request?: ProviderRequest,
): NativeDefinitionRequestProof {
  try {
    if (
      !request ||
      Object.keys(request.headers ?? {}).some((name) =>
        /^(authorization|proxy-authorization|x-api-key)$/iu.test(name),
      )
    )
      throw new DefinitionUnavailableError();
    const url = new URL(request.url);
    if (url.username || url.password || url.hash) throw new DefinitionUnavailableError();
    const configured = binding.request;
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([request.method, request.url, request.body ?? null]))
      .digest("hex");
    if (configured.providerId === "serpapi") {
      const expected = {
        engine: "google",
        q: configured.keyword,
        device: configured.device,
        gl: configured.location.gl,
        hl: configured.location.hl,
        location: configured.location.secondaryGeoName,
        nfpr: "1",
      };
      const rawStart = url.searchParams.get("start");
      const start = rawStart === null ? 0 : /^\d+$/u.test(rawStart) ? Number(rawStart) : NaN;
      if (
        request.method !== "GET" ||
        request.body ||
        url.origin !== "https://serpapi.com" ||
        url.pathname !== "/search.json" ||
        !Number.isSafeInteger(start) ||
        start < 0 ||
        start >= configured.depth ||
        start % 10 !== 0 ||
        [...url.searchParams].length !==
          Object.keys(expected).length + (rawStart === null ? 0 : 1) ||
        Object.entries(expected).some(
          ([key, value]) =>
            url.searchParams.getAll(key).length !== 1 || url.searchParams.get(key) !== value,
        ) ||
        url.searchParams.getAll("start").length > 1
      )
        throw new DefinitionUnavailableError();
      return {
        version: 1,
        route: "live",
        requestedDepth: configured.depth,
        pageStart: start,
        pageSize: 10,
        nativeDepth: null,
        priority: null,
        fingerprint,
      };
    }
    if (
      configured.providerId !== "dataforseo" ||
      request.method !== "POST" ||
      url.origin !== "https://api.dataforseo.com" ||
      url.search ||
      !["/v3/serp/google/organic/live/advanced", "/v3/serp/google/organic/task_post"].includes(
        url.pathname,
      )
    )
      throw new DefinitionUnavailableError();
    const body: unknown =
      typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    if (
      !Array.isArray(body) ||
      body.length !== 1 ||
      !body[0] ||
      typeof body[0] !== "object" ||
      Array.isArray(body[0])
    )
      throw new DefinitionUnavailableError();
    const task = body[0] as Record<string, unknown>;
    const location = locationForProvider(
      "dataforseo",
      serpRankLocation(configured.location),
      configured.location.kind === "city",
    );
    const geo =
      location.primaryGeoCode === null
        ? { location_name: location.primaryGeoName }
        : { location_code: location.primaryGeoCode };
    const expected = {
      depth: configured.depth,
      keyword: configured.keyword,
      device: configured.device,
      language_code: location.hl,
      search_param: "&nfpr=1",
      ...geo,
      ...(configured.stopOnMatch
        ? {
            find_targets_in: ["organic"],
            stop_crawl_on_match: [
              {
                match_type: "with_subdomains",
                match_value: normalizeDomain(configured.domain) ?? configured.domain,
              },
            ],
          }
        : {}),
    };
    const queued = url.pathname.endsWith("/task_post");
    const { tag, priority, ...semantic } = task;
    if (
      !sameDefinitionBytes(semantic, expected) ||
      (tag !== undefined && (typeof tag !== "string" || tag.length > 255)) ||
      (queued ? priority !== 1 && priority !== 2 : priority !== undefined)
    )
      throw new DefinitionUnavailableError();
    return {
      version: 1,
      route: queued ? "queued" : "live",
      requestedDepth: configured.depth,
      pageStart: null,
      pageSize: null,
      nativeDepth: configured.depth,
      priority: queued ? (priority as 1 | 2) : null,
      fingerprint,
    };
  } catch {
    throw new DefinitionUnavailableError();
  }
}
export async function retainNativeDefinitionRequest(
  tx: DefinitionTransaction,
  binding: DefinitionBinding,
  operationId: string,
  request?: ProviderRequest,
) {
  const proof = nativeDefinitionRequestProof(binding, request);
  if (binding.owner.queuedTaskId) {
    const [batch] = await tx.$queryRaw<
      Array<{ priority: string }>
    >`SELECT b.priority FROM queued_rank_check_batches b JOIN queued_rank_check_tasks t ON t."batchId"=b.id
      WHERE t.id=${binding.owner.queuedTaskId} AND t."rankCheckId"=${binding.owner.rankCheckId} AND t."keywordId"=${binding.keywordId} AND b."projectId"=${binding.projectId}`;
    if (
      !batch ||
      proof.route !== "queued" ||
      proof.priority !== (batch.priority === "normal" ? 1 : batch.priority === "high" ? 2 : null)
    )
      throw new DefinitionUnavailableError();
  } else if (proof.route !== "live") throw new DefinitionUnavailableError();
  await tx.$executeRaw`INSERT INTO measurement_native_request_proofs ("bindingId","operationId",proof) VALUES (${binding.id},${operationId},${JSON.stringify(proof)}::jsonb) ON CONFLICT ("bindingId","operationId") DO NOTHING`;
  const [retained] = await tx.$queryRaw<
    Array<{ proof: unknown }>
  >`SELECT proof FROM measurement_native_request_proofs WHERE "bindingId"=${binding.id} AND "operationId"=${operationId}`;
  if (!retained || !sameDefinitionBytes(retained.proof, proof))
    throw new DefinitionUnavailableError();
}
