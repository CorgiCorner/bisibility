import { GoogleRequestError } from "@/lib/providers/analytics/google-failure";
import { GscPropertyUrlError } from "@/lib/providers/analytics/gsc-property-membership";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderHttpError } from "@/lib/providers/failure-class";
import {
  getSearchIndexSitemap,
  inspectSearchIndexUrls,
  listSearchIndexSitemaps,
  SearchIndexConnectionError,
} from "@/lib/search-index/service";
import type { ApiContext } from "./context";
import { errorResponse, resourceResponse } from "./responses";
import { scopedProject, snakeizeKeys } from "./surface";

export async function searchIndexApi(ctx: ApiContext, projectId: string, path?: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  try {
    const result =
      ctx.method === "POST"
        ? await inspectSearchIndexUrls(ctx.auth.project.id, await ctx.req.json(), ctx.actorId)
        : path === undefined
          ? await listSearchIndexSitemaps(ctx.auth.project.id)
          : await getSearchIndexSitemap(ctx.auth.project.id, path);
    return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
  } catch (error) {
    const init = { headers: ctx.headers, instance: ctx.instance };
    if (error instanceof GscPropertyUrlError)
      return errorResponse("validation_failed", error.message, 400, {
        ...init,
        problemDetails: { code: error.code },
      });
    if (error instanceof SearchIndexConnectionError)
      return errorResponse("not_found", error.message, 404, init);
    if (error instanceof ProviderAuthError)
      return errorResponse(
        "provider_unavailable",
        "Provider authorization must be renewed.",
        422,
        init,
      );
    if (error instanceof GoogleRequestError && error.status === 404)
      return errorResponse(
        "not_found",
        path === undefined
          ? "Search Console property not found."
          : "Sitemap not found in Search Console for this property.",
        404,
        init,
      );
    if (error instanceof ProviderHttpError) {
      const denied =
        error.status === 403 ||
        (error instanceof GoogleRequestError && error.reason === "permission");
      return errorResponse(
        "provider_unavailable",
        denied
          ? "Search Console denied access to this property; check that the connected account can access it."
          : "Search Console request failed.",
        denied ? 422 : 502,
        init,
      );
    }
    throw error;
  }
}
