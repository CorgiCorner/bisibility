"use server";

import {
  markProjectAlertsRead as markProjectAlertsReadCore,
  muteTriggeredAlert as muteTriggeredAlertCore,
} from "@/lib/alerts/feed-mutations";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { appPath } from "@/lib/routing/app-path";
import { targetUrlValueSchema } from "@/lib/schemas/keyword";
import { z } from "zod";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateAlertViews,
} from "./_shared";
import { bulkSetTargetUrl } from "./keyword-bulk";

const projectScopeSchema = z.object({ projectId: z.string().min(1) });
const alertScopeSchema = projectScopeSchema.extend({ alertId: z.string().min(1) });
const alertTargetUrlSchema = alertScopeSchema.extend({ targetUrl: targetUrlValueSchema });

function requiredPublicId(value: string, prefix: "al" | "prj", resource: string) {
  if (parsePublicId(value)?.prefix !== prefix) {
    throw new Error(`${resource} reference is invalid.`);
  }
  return value;
}

function serpUrlFromPayload(payload: Prisma.JsonValue | null | undefined) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  for (const key of ["serpUrl", "serp_url", "url"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function googleSerpUrl(keyword: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(keyword)}`;
}

// Mark every firing alert in the project as read (acknowledged), no schema change.
export async function markProjectAlertsRead(input: unknown) {
  const { projectId } = parseActionInput(projectScopeSchema, input);
  const actor = await getActionActor();
  const result = await markProjectAlertsReadCore({
    actor,
    projectId: requiredPublicId(projectId, "prj", "Project"),
  });
  revalidateAlertViews();
  return result;
}

export async function muteTriggeredAlert(input: unknown) {
  const { alertId, projectId } = parseActionInput(alertScopeSchema, input);
  const actor = await getActionActor();
  const result = await muteTriggeredAlertCore({
    alertId: requiredPublicId(alertId, "al", "Triggered alert"),
    actor,
    projectId: requiredPublicId(projectId, "prj", "Project"),
  });
  revalidateAlertViews();
  return result;
}

// Resolve link targets for a row's CTAs (keyword page, SERP url, current target url).
export async function getAlertCtaTargets(input: unknown) {
  const { alertId, projectId } = parseActionInput(alertScopeSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectId, { type: "alert_rule" });
  const alert = await prisma.triggeredAlert.findFirst({
    select: {
      keyword: { select: { publicId: true, targetUrl: true, text: true } },
      payload: true,
      rankCheck: { select: { rankingUrl: true } },
    },
    where: {
      publicId: requiredPublicId(alertId, "al", "Triggered alert"),
      rule: { projectId: project.id },
    },
  });
  if (!alert) {
    throw new Error("Triggered alert not found.");
  }

  return {
    keywordHref: appPath(project.publicId, "rank-tracker", alert.keyword.publicId),
    keywordText: alert.keyword.text,
    serpUrl:
      serpUrlFromPayload(alert.payload) ??
      alert.rankCheck?.rankingUrl ??
      googleSerpUrl(alert.keyword.text),
    targetUrl: alert.keyword.targetUrl,
  };
}

// Set target URL via the existing keyword action, resolving the keyword from the alert.
export async function setAlertKeywordTargetUrl(input: unknown) {
  const { alertId, projectId, targetUrl } = parseActionInput(alertTargetUrlSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectId, { type: "alert_rule" });
  const alert = await prisma.triggeredAlert.findFirst({
    select: { keyword: { select: { publicId: true } } },
    where: {
      publicId: requiredPublicId(alertId, "al", "Triggered alert"),
      rule: { projectId: project.id },
    },
  });
  if (!alert) {
    throw new Error("Triggered alert not found.");
  }

  return bulkSetTargetUrl({
    keywordIds: [alert.keyword.publicId],
    projectId: project.publicId,
    targetUrl,
  });
}
