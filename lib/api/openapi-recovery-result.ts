import { openEnum } from "./openapi-sdk-schema";

export const recoveryResultProperties = {
  result_completeness: {
    description:
      "Completeness of a retained response. Partial or unresolved evidence never establishes a full-depth no-match.",
    type: "string",
    enum: ["complete", "partial", "unresolved"],
    ...openEnum("ResultCompleteness"),
  },
  returned_depth: {
    description: "Organic depth actually returned in retained evidence; null when unknown.",
    type: ["integer", "null"],
    minimum: 0,
  },
  comparison_allowed: {
    description: "Retained response projections do not replay historical rank comparisons.",
    type: "boolean",
    const: false,
  },
};
