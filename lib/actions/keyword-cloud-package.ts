"use server";

import { whereExecutedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId, requirePublicId } from "@/lib/db/public-id";
import { auditCloudPackageExport } from "@/lib/keywords/export-audit";
import { exportSectionsChunk } from "@/lib/migration/export-chunks";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import { assertCloudImportPackageLimits } from "./keyword-export-limits";

const inputSchema = z.object({
  projectId: z.string().refine((value) => parsePublicId(value)?.prefix === "prj", {
    message: "Expected a strict prj_ v3 public ID.",
  }),
});

async function loadKeywords(projectId: string) {
  return prisma.keyword.findMany({
    include: {
      rankChecks: { orderBy: { checkedAt: "desc" }, where: whereExecutedChecks() },
      tags: { include: { tag: true } },
    },
    orderBy: { createdAt: "desc" },
    where: { projectId },
  });
}

function packageKeywords(keywords: Awaited<ReturnType<typeof loadKeywords>>) {
  return keywords.map((keyword) => ({
    device: keyword.device,
    id: requirePublicId(keyword.publicId, "kw"),
    keyword: keyword.text,
    location: keyword.location,
    rankingHistory: keyword.rankChecks.map((check) => ({
      checkedAt: check.checkedAt.toISOString(),
      position: check.position,
      previousPosition: check.previousPosition,
      rankingUrl: check.rankingUrl,
    })),
    tags: keyword.tags.map((item) => item.tag.name),
    target_url: keyword.targetUrl,
  }));
}

function packageCounts(payload: {
  alert_rules: unknown[];
  competitors: unknown[];
  keywords: { rankingHistory: unknown[] }[];
  notification_preferences: unknown[];
  saved_views: unknown[];
}) {
  return {
    alertRules: payload.alert_rules.length,
    competitors: payload.competitors.length,
    keywords: payload.keywords.length,
    notificationPreferences: payload.notification_preferences.length,
    rankChecks: payload.keywords.reduce(
      (count, keyword) => count + keyword.rankingHistory.length,
      0,
    ),
    savedViews: payload.saved_views.length,
  };
}

export async function exportCloudImportPackage(input: unknown) {
  const data = parseActionInput(inputSchema, input);
  const actor = await getActionActor();
  const scoped = await requireProjectScope(actor, "read", data.projectId, { type: "keyword" });
  const [keywords, sections] = await Promise.all([
    loadKeywords(scoped.id),
    exportSectionsChunk({ projectId: scoped.id, userId: actor.id }),
  ]);
  assertCloudImportPackageLimits(keywords);
  const projectId = requirePublicId(scoped.publicId, "prj");
  const packagePayload = {
    alert_rules: sections.alert_rules,
    competitors: sections.competitors,
    exported_at: new Date().toISOString(),
    keywords: packageKeywords(keywords),
    notification_preferences: sections.notification_preferences,
    project_id: projectId,
    saved_views: sections.saved_views,
    scope: "history",
    version: 5,
  };
  const content = JSON.stringify(packagePayload, null, 2);
  await auditCloudPackageExport(actor.id, scoped.id, projectId, keywords.length);
  return {
    content,
    counts: packageCounts(packagePayload),
    filename: `bisibility-cloud-import-${projectId}.json`,
    mimeType: "application/json",
  };
}
