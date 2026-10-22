import { paymentResponseFields } from "./openapi-action-payment";
import { constraintUnion, sdkName, taggedUnion, usdCents } from "./openapi-sdk-schema";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const cents = { minimum: 0, type: "number", ...usdCents };

export const paymentEstimate = {
  properties: {
    ...paymentResponseFields,
    estimate: { type: "boolean", const: true },
    cached: { type: "boolean" },
    estimated_cost_cents: cents,
  },
  required: ["estimate", "cached", "estimated_cost_cents"],
  type: "object",
};
export function estimatedModule(data: object, name: string) {
  return {
    oneOf: [ref("DomainOverviewModuleEstimate"), data],
    ...taggedUnion("estimate", ["estimate", "module"]),
    ...sdkName(name),
  };
}

export const domainPaymentConsentConstraint = {
  if: { not: { properties: { estimate_only: { const: true } }, required: ["estimate_only"] } },
  // biome-ignore lint/suspicious/noThenProperty: JSON Schema conditional keyword, never a thenable.
  then: {
    anyOf: [{ required: ["accepted_payment"] }, { required: ["max_cost_cents"] }],
    ...constraintUnion,
  },
};
