import { usdCents } from "./openapi-sdk-schema";

const nullableNumber = { type: ["number", "null"] };
const nonnegativeInteger = { minimum: 0, type: "integer" };
const nullableCents = { ...nullableNumber, ...usdCents };

export const metricsProperties = {
  count: { type: ["integer", "null"] },
  estimated_traffic_cost_cents: nullableCents,
  etv: nullableNumber,
  is_down: nonnegativeInteger,
  is_lost: nonnegativeInteger,
  is_new: nonnegativeInteger,
  is_up: nonnegativeInteger,
  pos1: nonnegativeInteger,
  pos2_3: nonnegativeInteger,
  pos4_10: nonnegativeInteger,
  pos11_20: nonnegativeInteger,
  pos21_30: nonnegativeInteger,
  pos31_40: nonnegativeInteger,
  pos41_50: nonnegativeInteger,
  pos51_60: nonnegativeInteger,
  pos61_70: nonnegativeInteger,
  pos71_80: nonnegativeInteger,
  pos81_90: nonnegativeInteger,
  pos91_100: nonnegativeInteger,
};

export const metricsRequired = Object.keys(metricsProperties);
