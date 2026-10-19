import { alertRuleFormSchema, alertRuleUpdateFormSchema } from "@/lib/alerts/schema";
import { z } from "zod";

// Literal patterns: semgrep rejects RegExp built from a variable, even a constant prefix.
const idPatterns = {
  kw: /^kw_[a-z][a-z0-9]{23}$/,
  pmkt: /^pmkt_[a-z][a-z0-9]{23}$/,
  tag: /^tag_[a-z][a-z0-9]{23}$/,
  usr: /^usr_[a-z][a-z0-9]{23}$/,
} as const;
const id = (prefix: keyof typeof idPatterns) =>
  z.string().trim().min(1).max(120).regex(idPatterns[prefix]);
const ids = {
  marketIds: z.array(id("pmkt")),
  recipientIds: z.array(id("usr")).optional(),
  targetIds: z.array(z.union([id("kw"), id("tag")])).default([]),
};

// The REST handlers already require these public IDs after parsing. Put the same checks in
// their zod inputs so request conformance includes the complete boundary validation.
export const alertCreateInput = alertRuleFormSchema.safeExtend({
  ...ids,
  marketIds: ids.marketIds.default([]),
});
export const alertUpdateInput = alertRuleUpdateFormSchema.safeExtend({
  ...ids,
  marketIds: ids.marketIds.optional(),
});
