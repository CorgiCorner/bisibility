"use server";

import { DeliveryHttpError, postSignedWebhookTest } from "@/lib/alerts/delivery";
import { getAlertRuleDepthWarning } from "@/lib/alerts/depth-conflict.server";
import { alertServerSchemas } from "@/lib/alerts/schema.server";
import { assertWebhookUrlAllowed } from "@/lib/alerts/webhook-guard";
import type { WebhookEndpointInput } from "@/lib/alerts/webhook-schema";
import {
  createAlertRuleRecord,
  deleteAlertRuleRecord,
  requireAlertRule,
  updateAlertRuleRecord,
} from "@/lib/api/alert-service";
import { ApiConflictError, ApiInputError } from "@/lib/api/errors";
import {
  createWebhookEndpointRecord,
  deleteWebhookEndpointRecord,
  findWebhookEndpointDeliveryTarget,
  updateWebhookEndpointRecord,
} from "@/lib/api/webhook-service";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { ZodError } from "zod";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateAlertViews,
} from "./_shared";

async function alertRuleScope(action: "create" | "delete" | "update", projectId: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, action, projectId, {
    type: "alert_rule",
  });
  return { actorId: actor.id, projectId: project.id };
}

export async function createAlertRule(input: unknown) {
  const data = parseActionInput(alertServerSchemas.ruleForm, input);
  const scope = await alertRuleScope("create", data.projectId);
  const warning = await getAlertRuleDepthWarning(data, scope.projectId);
  const rule = await createAlertRuleRecord(data, scope).catch((error: unknown) => {
    if (error instanceof ApiConflictError) {
      return { error: error.message, ok: false as const };
    }
    throw error;
  });
  if ("ok" in rule) {
    return rule;
  }
  revalidateAlertViews();

  return {
    id: requiredPublicAuditId(rule.publicId, "alr", "Alert rule"),
    ok: true as const,
    warning,
  };
}

export async function createKeywordAlertRule(input: { keywordId?: unknown; projectId?: unknown }) {
  // biome-ignore format: keep quick-create defaults compact under the module line cap.
  return createAlertRule({ channels: [], conditionType: "exits_top_n", enabled: true, name: "Slipped out of top 10", projectId: input?.projectId, targetIds: [input?.keywordId], targetType: "keyword", topN: 10 });
}

export async function updateAlertRule(input: unknown) {
  const data = parseActionInput(alertServerSchemas.ruleForm, input);
  if (!data.ruleId) {
    throw new Error("Alert rule id is required.");
  }

  const scope = await alertRuleScope("update", data.projectId);
  const warning = await getAlertRuleDepthWarning(data, scope.projectId);
  const rule = await updateAlertRuleRecord(data, scope);
  revalidateAlertViews();

  return { id: requiredPublicAuditId(rule.publicId, "alr", "Alert rule"), warning };
}

export async function setAlertRuleEnabled(input: unknown) {
  const data = parseActionInput(alertServerSchemas.ruleToggle, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "alert_rule",
  });
  const before = await requireAlertRule(project.id, data.ruleId);
  const rule = await prisma.alertRule.update({
    data: { enabled: data.enabled },
    where: { id: before.id },
  });

  await writeAudit({
    action: "alert_rule.set_enabled",
    actorId: actor.id,
    after: { enabled: rule.enabled },
    before: { enabled: before.enabled },
    projectId: project.id,
    targetId: requiredPublicAuditId(rule.publicId, "alr", "Alert rule"),
    targetType: "alert_rule",
  });
  revalidateAlertViews();

  return { enabled: rule.enabled, id: requiredPublicAuditId(rule.publicId, "alr", "Alert rule") };
}

export async function deleteAlertRule(input: unknown) {
  const data = parseActionInput(alertServerSchemas.ruleDelete, input);
  const result = await deleteAlertRuleRecord(
    { ruleId: data.ruleId },
    await alertRuleScope("delete", data.projectId),
  );
  revalidateAlertViews();

  return {
    deleted: result.deleted,
    id: requiredPublicAuditId(data.ruleId, "alr", "Alert rule"),
  };
}

export async function upsertWebhookEndpoint(input: unknown) {
  let data: WebhookEndpointInput;
  try {
    data = parseActionInput(alertServerSchemas.webhookEndpoint, input);
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        error: error.issues[0]?.message ?? "Review the webhook endpoint fields.",
        ok: false as const,
      };
    }
    throw error;
  }
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "webhook_endpoint",
  });
  const scope = { actorId: actor.id, projectId: project.id };
  try {
    await assertWebhookUrlAllowed(data.url);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Webhook URL is not allowed.",
      ok: false as const,
    };
  }

  let endpoint: Awaited<ReturnType<typeof updateWebhookEndpointRecord>>;
  if (data.endpointId) {
    endpoint = await updateWebhookEndpointRecord(
      data.endpointId,
      {
        description: data.description ?? null,
        enabled: data.enabled,
        hmacSecret: data.hmacSecret ?? undefined,
        url: data.url,
      },
      scope,
    );
    if (!endpoint) {
      throw new Error("Webhook endpoint not found.");
    }
  } else {
    if (!data.hmacSecret) {
      throw new Error("Webhook HMAC secret is required.");
    }
    try {
      endpoint = await createWebhookEndpointRecord(
        {
          description: data.description ?? null,
          enabled: data.enabled,
          hmacSecret: data.hmacSecret,
          url: data.url,
        },
        scope,
      );
    } catch (error) {
      if (error instanceof ApiInputError) {
        return { error: error.message, ok: false as const };
      }
      throw error;
    }
  }
  revalidateAlertViews();

  return {
    id: requiredPublicAuditId(endpoint.publicId, "we", "Webhook endpoint"),
    ok: true as const,
  };
}

export async function testWebhookEndpoint(input: unknown) {
  const data = parseActionInput(alertServerSchemas.webhookEndpointMember, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "webhook_endpoint",
  });
  const endpoint = await findWebhookEndpointDeliveryTarget(project.id, data.endpointId);
  if (!endpoint) {
    return { error: "Webhook endpoint not found.", ok: false as const };
  }
  if (!endpoint.enabled) {
    return { error: "Enable the endpoint before sending a test.", ok: false as const };
  }

  try {
    const result = await postSignedWebhookTest(endpoint, {
      projectDomain: trackedProjectDomain(project.domain) ?? "",
      projectId: project.publicId,
      webhookId: endpoint.publicId,
    });
    return { ...result, ok: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Webhook test delivery failed.",
      latencyMs: error instanceof DeliveryHttpError ? error.latencyMs : null,
      ok: false as const,
      status: error instanceof DeliveryHttpError ? error.status : null,
    };
  }
}

export async function deleteWebhookEndpoint(input: unknown) {
  const data = parseActionInput(alertServerSchemas.webhookEndpointMember, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "webhook_endpoint",
  });
  const endpoint = await deleteWebhookEndpointRecord(data.endpointId, {
    actorId: actor.id,
    projectId: project.id,
  });
  if (!endpoint) {
    return { error: "Webhook endpoint not found.", ok: false as const };
  }
  revalidateAlertViews();
  return {
    id: requiredPublicAuditId(endpoint.publicId, "we", "Webhook endpoint"),
    ok: true as const,
  };
}

export async function updateSlackConnectionPlaceholder(input: unknown) {
  const data = parseActionInput(alertServerSchemas.slackConnectionPlaceholder, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "slack_connection",
  });
  const before = await prisma.slackConnection.findUnique({ where: { projectId: project.id } });

  if (!before) {
    return { connected: false, enabled: false, message: "Slack installation is not wired yet." };
  }

  const connection = await prisma.slackConnection.update({
    data: { enabled: data.enabled },
    where: { projectId: project.id },
  });

  await writeAudit({
    action: "slack_connection.update",
    actorId: actor.id,
    after: { enabled: connection.enabled },
    before: { enabled: before.enabled },
    projectId: project.id,
    targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
    targetType: "project",
  });
  revalidateAlertViews();

  return { connected: true, enabled: connection.enabled };
}
