import { getPageIndexingReport } from "@/lib/search-index/report";
import { pageIndexingUrlsQuerySchema } from "@/lib/search-index/report-schema";
import { SearchIndexConnectionError } from "@/lib/search-index/service";
import { getPageIndexingSettings, updatePageIndexingSettings } from "@/lib/search-index/settings";
import { listPageIndexingUrls } from "@/lib/search-index/urls";
import type { ApiContext } from "./context";
import { errorResponse, resourceResponse } from "./responses";
import { scopedProject, snakeizeKeys } from "./surface";

export async function pageIndexingApi(ctx: ApiContext, projectId: string, action: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const id = ctx.auth.project.id;
  try {
    const result =
      action === "report"
        ? await getPageIndexingReport(id)
        : action === "urls"
          ? await listPageIndexingUrls(
              id,
              pageIndexingUrlsQuerySchema.parse(
                Object.fromEntries(new URL(ctx.req.url).searchParams),
              ),
            )
          : ctx.method === "PATCH"
            ? await updatePageIndexingSettings(id, await ctx.req.json(), ctx.actorId ?? null)
            : await getPageIndexingSettings(id);
    return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
  } catch (error) {
    if (error instanceof SearchIndexConnectionError)
      return errorResponse("not_found", error.message, 404, {
        headers: ctx.headers,
        instance: ctx.instance,
      });
    throw error;
  }
}
