"use server";

import { recordAppAction } from "@/lib/activity/app-mutation";
import { captureProjectWork } from "@/lib/challenge-report/capture-project-work";
import { CONVERSION_SOURCES } from "@/lib/conversions/types";
import { projectPagesPeriod } from "@/lib/pages/period";
import { getProjectPagesList } from "@/lib/pages/queries";
import { addManualProjectPages, syncProjectPages } from "@/lib/pages/sync";
import {
  pageStatusFilters,
  projectPageCoverageState,
  projectPageCwvFilters,
  projectPageIndexGroups,
  projectPageSortKeys,
  projectPageSourceKinds,
} from "@/lib/pages/types";
import { PROJECT_PAGES_PAGE_SIZE } from "@/lib/pages/url-state";
import { appPath } from "@/lib/routing/app-path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const projectSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
});

const listSchema = projectSchema.extend({
  conv: z.enum(CONVERSION_SOURCES).optional(),
  dir: z.enum(["asc", "desc"]),
  index: z.enum(projectPageIndexGroups).optional(),
  coverage: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .refine((value) => projectPageCoverageState(value) === value)
    .optional(),
  cwv: z.enum(projectPageCwvFilters).optional(),
  page: z.number().int().min(1).max(10_000),
  period: z.enum(["7", "28", "90"]),
  search: z.string().trim().max(200).optional(),
  sitemap: z.enum(["listed", "not_listed"]).optional(),
  sort: z.enum(projectPageSortKeys),
  source: z.enum(projectPageSourceKinds).optional(),
  status: z.enum(pageStatusFilters).optional(),
  tag: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]+$/u)
    .max(80)
    .optional(),
});

const manualSchema = projectSchema.extend({
  text: z.string().max(100_000),
});

const MANUAL_LINE_LIMIT = 500;
const TOO_MANY_LINES = "Paste at most 500 lines.";

function revalidatePages(publicId: string) {
  revalidatePath(appPath(publicId, "pages"));
}

/** On-demand page registry refresh. */
export async function refreshProjectPagesAction(input: unknown) {
  const data = parseActionInput(projectSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const result = await syncProjectPages(project.id, { now: new Date() });
  if (result.status === "ok") {
    recordAppAction(actor);
    revalidatePages(project.publicId);
  }
  return result;
}

/** One server page of the project URL registry. */
export async function loadProjectPagesAction(input: unknown) {
  const data = parseActionInput(listSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(
    actor,
    "read",
    data.projectId,
    { type: "project" },
    {
      allowReadOnly: true,
    },
  );
  const period = projectPagesPeriod(data.period);
  return getProjectPagesList(project.id, {
    conversionSource: data.conv,
    indexGroup: data.index,
    ...(data.coverage ? { coverageState: data.coverage } : {}),
    cwv: data.cwv,
    page: data.page,
    pageSize: PROJECT_PAGES_PAGE_SIZE,
    period: { from: period.from, to: period.to },
    search: data.search || undefined,
    sitemapState: data.sitemap,
    sort: { by: data.sort, dir: data.dir },
    source: data.source,
    status: data.status,
    tagId: data.tag,
  });
}

/** Adds pasted URLs or paths. More than 500 lines is rejected before the registry write. */
export async function addManualProjectPagesAction(input: unknown) {
  const data = parseActionInput(manualSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const lines = data.text.split(/\r?\n/);
  if (lines.length > MANUAL_LINE_LIMIT) {
    return {
      added: 0,
      existing: 0,
      rejected: [{ line: MANUAL_LINE_LIMIT + 1, reason: TOO_MANY_LINES, value: "" }],
    };
  }
  const result = await addManualProjectPages(project.id, [data.text], actor);
  if (result.added > 0) {
    recordAppAction(actor);
    captureProjectWork(actor.id, project.id);
    revalidatePages(project.publicId);
  }
  return result;
}
