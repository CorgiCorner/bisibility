import "server-only";

import { type PublicIdPrefix, parsePublicId } from "@/lib/db/public-id";
import type { z } from "zod";
import {
  alertRuleDeleteSchema,
  alertRuleFormBaseSchema,
  alertRuleToggleSchema,
  refineAlertRuleForm,
  slackConnectionPlaceholderSchema,
} from "./schema";
// The private-network refinement now lives inside webhook-schema (main's
// node:net-free split); no extra server-side refine is needed here.
import { webhookEndpointMemberSchema, webhookEndpointSchema } from "./webhook-schema";

function validatePublicId(
  value: string | undefined,
  prefix: PublicIdPrefix,
  path: (string | number)[],
  ctx: z.RefinementCtx,
) {
  if (value && parsePublicId(value)?.prefix !== prefix) {
    ctx.addIssue({
      code: "custom",
      message: `Expected a ${prefix}_ public ID.`,
      path,
    });
  }
}

export const alertRuleFormServerSchema = alertRuleFormBaseSchema.superRefine((value, ctx) => {
  refineAlertRuleForm(value, ctx);
  validatePublicId(value.projectId, "prj", ["projectId"], ctx);
  validatePublicId(value.ruleId, "alr", ["ruleId"], ctx);
  value.marketIds?.forEach((id, index) => {
    validatePublicId(id, "pmkt", ["marketIds", index], ctx);
  });
  value.recipientIds?.forEach((id, index) => {
    validatePublicId(id, "usr", ["recipientIds", index], ctx);
  });
  const targetPrefix =
    value.targetType === "keyword" ? "kw" : value.targetType === "tag" ? "tag" : null;
  if (targetPrefix) {
    value.targetIds.forEach((id, index) => {
      validatePublicId(id, targetPrefix, ["targetIds", index], ctx);
    });
  }
});
export const alertRuleToggleServerSchema = alertRuleToggleSchema.superRefine((value, ctx) => {
  validatePublicId(value.projectId, "prj", ["projectId"], ctx);
  validatePublicId(value.ruleId, "alr", ["ruleId"], ctx);
});
export const alertRuleDeleteServerSchema = alertRuleDeleteSchema.superRefine((value, ctx) => {
  validatePublicId(value.projectId, "prj", ["projectId"], ctx);
  validatePublicId(value.ruleId, "alr", ["ruleId"], ctx);
});
export const slackConnectionPlaceholderServerSchema = slackConnectionPlaceholderSchema.superRefine(
  (value, ctx) => {
    validatePublicId(value.projectId, "prj", ["projectId"], ctx);
  },
);

export const webhookEndpointServerSchema = webhookEndpointSchema.superRefine((value, ctx) => {
  validatePublicId(value.projectId, "prj", ["projectId"], ctx);
  validatePublicId(value.endpointId, "we", ["endpointId"], ctx);
});
export const webhookEndpointMemberServerSchema = webhookEndpointMemberSchema.superRefine(
  (value, ctx) => {
    validatePublicId(value.projectId, "prj", ["projectId"], ctx);
    validatePublicId(value.endpointId, "we", ["endpointId"], ctx);
  },
);

export const alertServerSchemas = {
  ruleDelete: alertRuleDeleteServerSchema,
  ruleForm: alertRuleFormServerSchema,
  ruleToggle: alertRuleToggleServerSchema,
  slackConnectionPlaceholder: slackConnectionPlaceholderServerSchema,
  webhookEndpoint: webhookEndpointServerSchema,
  webhookEndpointMember: webhookEndpointMemberServerSchema,
};
