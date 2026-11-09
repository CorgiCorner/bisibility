"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { consume } from "@/lib/api/ratelimit";
import { GscPropertyUrlError } from "@/lib/providers/analytics/gsc-property-membership";
import { requireReadableProject } from "@/lib/queries/_auth";
import { searchConsolePath } from "@/lib/routing/app-path";
import { readProjectSitemaps } from "@/lib/search-index/read-sitemaps";
import { searchIndexInspectionSchema } from "@/lib/search-index/schema";
import { connectionForProject, inspectSearchIndexUrls } from "@/lib/search-index/service";
import type { InspectionFeedback } from "@/lib/search-index/ui-model";
import { storedIndexingDetail } from "@/lib/search-index/ui-storage";
import { pageIndexingTableQuerySchema } from "@/lib/search-index/url-page";
import { listPageIndexingUrls } from "@/lib/search-index/urls";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionActor, requireProjectScope } from "./_shared";

const projectRef = z.string().min(1).max(120);
const inspectSchema = searchIndexInspectionSchema.extend({ projectId: projectRef });
const detailSchema = z.object({ projectId: projectRef, url: z.string().min(1).max(2048) });
const listSchema = z.object({ projectId: projectRef, query: pageIndexingTableQuerySchema });

export async function inspectPageIndexingUrls(input: unknown): Promise<InspectionFeedback[]> {
  const { projectId, urls } = inspectSchema.parse(input);
  const actor = await getActionActor();
  // REST inspection inherits the member write tier; the app also enforces project write mode.
  const project = await requireProjectScope(actor, "update", projectId, { type: "project" });
  try {
    const result = await inspectSearchIndexUrls(project.id, { urls }, actor.id);
    if (result.results.some((row) => !row.error)) recordAppAction(actor);
    revalidatePath(searchConsolePath(project.publicId));
    return result.results.map(({ url, error }) => ({
      url,
      status: !error
        ? "success"
        : error.code === "inspection_daily_limit"
          ? "daily"
          : error.code === "provider_rate_limited" && error.scope === "daily"
            ? "daily"
            : error.code === "provider_rate_limited" && error.scope === "minute"
              ? "minute"
              : "failure",
    }));
  } catch (error) {
    if (error instanceof GscPropertyUrlError)
      return urls.map((url) => ({ url, status: "outside" }));
    // Provider details can contain sensitive transport context; expose only catalog keys.
    return urls.map((url) => ({ url, status: "failure" }));
  }
}

export async function loadPageIndexingUrls(input: unknown) {
  const { projectId, query } = listSchema.parse(input);
  const { project } = await requireReadableProject(projectId);
  return listPageIndexingUrls(project.id, query, query);
}

export async function loadPageIndexingDetail(input: unknown) {
  const { projectId, url } = detailSchema.parse(input);
  const { project } = await requireReadableProject(projectId);
  const { property } = await connectionForProject(project.id);
  return storedIndexingDetail(project.id, property, url);
}

export async function readPageIndexingSitemaps(
  input: unknown,
): Promise<{ status: "ok" | "rate_limited" | "error" }> {
  const { projectId } = z.object({ projectId: projectRef }).parse(input);
  const { project } = await requireReadableProject(projectId);
  try {
    const rate = await consume({
      prefix: "search-index:sitemap-read",
      bucketKey: project.id,
      limit: 1,
      windowSeconds: 60,
    });
    if (!rate.success) return { status: "rate_limited" };
    await readProjectSitemaps(project.id);
    return { status: "ok" };
  } catch {
    return { status: "error" };
  } finally {
    revalidatePath(searchConsolePath(project.publicId));
  }
}
