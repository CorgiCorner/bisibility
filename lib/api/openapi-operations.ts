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
