import { problemResponse } from "./openapi-problem";

function hasRequestBody(operation: object): operation is object & { requestBody: object } {
  return (
    "requestBody" in operation &&
    operation.requestBody !== null &&
    typeof operation.requestBody === "object"
  );
}

export function withRequiredBody<T extends object>(operation: T) {
  if (!hasRequestBody(operation)) {
    return operation;
  }

  return {
    ...operation,
    requestBody: { ...operation.requestBody, required: true },
  };
}

export const BYOK_REQUIRED_RESPONSE =
  "`byok_required`: the account runs paid provider work only on its own provider keys and none serves this request";

/** Paid provider operations can also refuse an account that must use its own provider keys. */
function withByokRequired(responses: Record<string, object>) {
  const forbidden = responses["403"] as { description?: string } | undefined;
  return {
    content: {
      "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } },
    },
    ...forbidden,
    description: forbidden?.description
      ? `${forbidden.description}, or ${BYOK_REQUIRED_RESPONSE}`
      : `Forbidden, or ${BYOK_REQUIRED_RESPONSE}`,
  };
}

export function withCreditsExhausted<T extends object>(operation: T) {
  const responses = (operation as { responses: Record<string, object> }).responses;
  return {
    ...operation,
    responses: {
      ...responses,
      "403": withByokRequired(responses),
      "402": problemResponse("Deployment credits exhausted for a paid provider request"),
    },
  };
}
