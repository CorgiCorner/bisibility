import "server-only";

import {
  markProjectAlertsRead as markProjectAlertsReadCore,
  muteTriggeredAlert as muteTriggeredAlertCore,
} from "@/lib/alerts/feed-mutations";
import {
  alertRuleDeleteSchema,
  alertRuleFormSchema,
  alertRuleUpdateFormSchema,
} from "@/lib/alerts/schema";
import { listAlertRuleViews, listTriggeredAlertViews } from "./alert-list";
import { alertRuleApiResources, triggeredAlertApiResources } from "./alert-resources";
import {
  createAlertRuleRecord,
  deleteAlertRuleRecord,
  updateAlertRuleRecord,
} from "./alert-service";
import type { ApiContext } from "./context";
import { paginateArray } from "./pagination";
import { requireApiAlertRulePublicIds, requireApiPublicId } from "./public-id";
import { listResponse, resourceResponse } from "./responses";
import {
  objectBody,
  parseApiInput,
  readJsonBody,
  runDomain,
  scopedProject,
  snakeizeKeys,
} from "./surface";

function alertContext(ctx: ApiContext) {
  return { actorId: null, projectId: ctx.auth.project.id };
}

async function alertRuleMutationResource(projectId: string, ruleId: string) {
  const view = (await listAlertRuleViews(projectId)).find((rule) => rule.id === ruleId);
  if (!view) throw new Error("Alert rule could not be loaded after mutation.");
  const [resource] = await alertRuleApiResources([view]);
  if (!resource) throw new Error("Alert rule resource could not be serialized.");
  return resource;
}

export async function listAlertRules(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const rules = await runDomain(async () =>
    alertRuleApiResources(await listAlertRuleViews(ctx.auth.project.id)),
  );
  const { nextCursor, page } = paginateArray(ctx.url, rules);

  return listResponse(page.map(snakeizeKeys), nextCursor, { headers: ctx.headers });
}

export async function createAlertRuleForProject(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const body = await readJsonBody(ctx);
  const input = parseApiInput(alertRuleFormSchema, { ...objectBody(body), project_id: projectId });
  requireApiAlertRulePublicIds(input);
  const rule = await runDomain(() => createAlertRuleRecord(input, alertContext(ctx)));
  const resource = await runDomain(() =>
    alertRuleMutationResource(ctx.auth.project.id, requireApiPublicId(rule.publicId ?? "", "alr")),
  );

  return resourceResponse(snakeizeKeys(resource), { headers: ctx.headers, status: 201 });
}

export async function updateAlertRuleById(ctx: ApiContext, ruleId: string) {
  const body = await readJsonBody(ctx);
  const input = parseApiInput(alertRuleUpdateFormSchema, {
    ...objectBody(body),
    project_id: ctx.auth.project.id,
    rule_id: ruleId,
  });
  requireApiAlertRulePublicIds(input);
  const rule = await runDomain(() => updateAlertRuleRecord(input, alertContext(ctx)));
  const resource = await runDomain(() =>
    alertRuleMutationResource(ctx.auth.project.id, requireApiPublicId(rule.publicId ?? "", "alr")),
  );

  return resourceResponse(snakeizeKeys(resource), { headers: ctx.headers });
}

export async function deleteAlertRuleById(ctx: ApiContext, ruleId: string, projectId?: string) {
  if (projectId) {
    const scoped = scopedProject(ctx, projectId);
    if (scoped) return scoped;
  }

  const input = parseApiInput(alertRuleDeleteSchema, {
    project_id: projectId ?? ctx.auth.project.id,
    rule_id: ruleId,
  });
  const result = await runDomain(() =>
    deleteAlertRuleRecord({ ruleId: input.ruleId }, alertContext(ctx)),
  );

  return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
}

export async function listTriggeredAlerts(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const alerts = await runDomain(async () =>
    triggeredAlertApiResources(await listTriggeredAlertViews(ctx.auth.project.id)),
  );
  const { nextCursor, page } = paginateArray(ctx.url, alerts);

  return listResponse(page.map(snakeizeKeys), nextCursor, { headers: ctx.headers });
}

export async function markProjectTriggeredAlertsRead(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const result = await runDomain(() =>
    markProjectAlertsReadCore({
      actor: ctx.actor as NonNullable<ApiContext["actor"]>,
      auditActorId: ctx.actorId,
      projectId: ctx.auth.project.id,
    }),
  );
  return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
}

export async function muteProjectTriggeredAlert(
  ctx: ApiContext,
  projectId: string,
  alertId: string,
) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const result = await runDomain(() =>
    muteTriggeredAlertCore({
      actor: ctx.actor as NonNullable<ApiContext["actor"]>,
      alertId,
      auditActorId: ctx.actorId,
      projectId: ctx.auth.project.id,
    }),
  );
  return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
}
