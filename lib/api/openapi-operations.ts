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

export function withCreditsExhausted<T extends object>(operation: T) {
  const responses = (operation as { responses: Record<string, object> }).responses;
  return {
    ...operation,
    responses: {
      ...responses,
      "402": {
        content: {
          "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } },
        },
        description: "Deployment credits exhausted for a paid provider request",
      },
    },
  };
}
