"use server";

import {
  PROJECT_PAGES_EXPORT_LIMIT,
  type ProjectPagesCsvResult,
  projectPagesCsv,
  projectPagesExportColumns,
} from "@/lib/pages/export-csv";
import { projectPagesListInput } from "@/lib/pages/list-input";
import { projectPagesLoadSchema } from "@/lib/pages/list-schema";
import { getProjectPageSources, getProjectPagesExportList } from "@/lib/pages/queries";
import { datedCsvFilename } from "@/lib/ui/export-filename";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const schema = projectPagesLoadSchema
  .extend({
    window: z
      .object({ from: z.iso.datetime(), to: z.iso.datetime() })
      .strict()
      .refine((value) => new Date(value.from) <= new Date(value.to))
      .refine(
        (value) => new Date(value.to).getTime() - new Date(value.from).getTime() <= 90 * 86400000,
      ),
    columns: z
      .array(z.enum(projectPagesExportColumns))
      .min(1)
      .max(projectPagesExportColumns.length)
      .refine((columns) => new Set(columns).size === columns.length),
  })
  .strict()
  .refine((data) => {
    const from = new Date(data.window.from).getTime();
    const to = new Date(data.window.to).getTime();
    return from % 86400000 === 0 && to - from === (Number(data.period) - 1) * 86400000;
  }, "Export dates must match the displayed period.");
export async function exportProjectPagesCsv(input: unknown): Promise<ProjectPagesCsvResult> {
  const data = parseActionInput(schema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(
    actor,
    "read",
    data.projectId,
    { type: "project" },
    { allowReadOnly: true },
  );
  const listInput = {
    ...projectPagesListInput(data),
    period: { from: new Date(data.window.from), to: new Date(data.window.to) },
  };
  const list = await getProjectPagesExportList(project.id, listInput);
  if (data.sitemap && !list.sitemapChecked) return { status: "sitemap_not_checked" };
  if (data.sitemap === "not_listed" && list.sitemapComplete === false)
    return { status: "sitemap_incomplete" };
  if (list.total > PROJECT_PAGES_EXPORT_LIMIT || list.rows.length > PROJECT_PAGES_EXPORT_LIMIT) {
    return { status: "too_large", limit: PROJECT_PAGES_EXPORT_LIMIT };
  }
  const sources = await getProjectPageSources(project.id);
  return {
    status: "ok",
    csv: projectPagesCsv(list.rows, data.columns, sources),
    rows: list.rows.length,
    filename: datedCsvFilename("pages", project.publicId, {
      start: listInput.period.from.toISOString().slice(0, 10),
      end: listInput.period.to.toISOString().slice(0, 10),
    }),
  };
}
