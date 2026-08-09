import "server-only";

import type { AlertTargetOptions } from "@/lib/alerts/alert-data";
import { getRequestAlertKeywordData } from "@/lib/alerts/alert-request-data";
import {
  alertDepthConflict,
  minimumTargetedDepth,
  type TargetedDepthKeyword,
} from "@/lib/alerts/depth-conflict";
import { privateNetworkAllowed } from "@/lib/alerts/webhook-target";
import { listAlertRuleViews, listTriggeredAlertViews } from "@/lib/api/alert-list";
import { listWebhookEndpointsWithHistory } from "@/lib/api/webhook-service";
import { prisma } from "@/lib/db/prisma";
import { type PublicIdPrefix, parsePublicId } from "@/lib/db/public-id";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { requireReadableProject } from "./_auth";

function requiredPublicId(value: string | null, prefix: PublicIdPrefix, resource: string) {
  if (!value || parsePublicId(value)?.prefix !== prefix) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}

async function loadTargets(projectId: string) {
  const [keywordData, tags, members, webhookEndpoints] = await Promise.all([
    getRequestAlertKeywordData(projectId),
    prisma.tag.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, publicId: true },
      where: { projectId },
    }),
    prisma.user.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { email: true, id: true, name: true, publicId: true },
      where: {
        OR: [{ projects: { some: { id: projectId } } }, { memberships: { some: { projectId } } }],
      },
    }),
    listWebhookEndpointsWithHistory(projectId),
  ]);

  return {
    depthKeywords: keywordData.keywords.map(
      (keyword): TargetedDepthKeyword => ({
        id: requiredPublicId(keyword.publicId, "kw", "Keyword"),
        projectDepth: keywordData.projectDepth,
        scheduleDepth: keyword.schedule?.serpDepth,
        tagIds: keyword.tags.flatMap((tag) =>
          tag.tag ? [requiredPublicId(tag.tag.publicId, "tag", "Tag")] : [],
        ),
      }),
    ),
    options: {
      keywords: keywordData.keywords.map((keyword) => ({
        id: requiredPublicId(keyword.publicId, "kw", "Keyword"),
        label: keyword.text,
      })),
      members: members.map((user) => ({
        id: requiredPublicId(user.publicId, "usr", "User"),
        label: `${user.name} (${user.email})`,
      })),
      tags: tags.map((tag) => ({
        id: requiredPublicId(tag.publicId, "tag", "Tag"),
        label: tag.name,
      })),
      webhookEndpoints: webhookEndpoints.map(
        ({ deliveryAttempts, description, enabled, lastDeliveryAt, publicId, url }) => ({
          deliveryAttempts: deliveryAttempts.map((attempt) => ({
            attemptedAt: attempt.attemptedAt.toISOString(),
            error: attempt.error,
            event:
              attempt.triggeredAlert.rankCheck?.trigger === "scheduled"
                ? ("alert.digest" as const)
                : ("alert.fired" as const),
            status: attempt.status,
          })),
          description,
          enabled,
          id: requiredPublicId(publicId, "we", "Webhook endpoint"),
          lastDeliveryAt: lastDeliveryAt?.toISOString() ?? null,
          url,
        }),
      ),
      webhookPrivateNetworkAllowed: privateNetworkAllowed({}),
    } satisfies AlertTargetOptions,
  };
}

export async function getAlertsView(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  const [rules, alerts, targets] = await Promise.all([
    listAlertRuleViews(project.id),
    listTriggeredAlertViews(project.id),
    loadTargets(project.id),
  ]);

  return {
    alerts,
    project: { ...project, id: project.publicId },
    rules: rules.map((rule) => ({
      ...rule,
      depthConflict: alertDepthConflict(rule, minimumTargetedDepth(rule, targets.depthKeywords)),
    })),
    targets: { ...targets.options, projectDomain: trackedProjectDomain(project.domain) ?? "" },
  };
}
