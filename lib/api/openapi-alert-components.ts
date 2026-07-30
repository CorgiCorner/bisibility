import { alertRuleToolProperties } from "@/lib/alerts/tool-schema";

export const alertRuleSchemas = {
  AlertRuleInput: {
    properties: alertRuleToolProperties,
    required: ["name", "condition_type"],
    type: "object",
  },
};
