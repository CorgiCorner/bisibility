import { apiVersionHeaderParameter } from "./api-versions";
import { problemContent } from "./openapi-problem";

type OpenApiVersionedOperation = {
  parameters?: object[];
  responses?: Record<string, unknown>;
};

export function withApiVersionContract(operation: OpenApiVersionedOperation) {
  const existingConflict = operation.responses?.["409"] as
    | { content?: Record<string, unknown>; description?: string }
    | undefined;
  const conflictDescriptions = [existingConflict?.description, "Unsupported API version"];

  return {
    parameters: [apiVersionHeaderParameter, ...(operation.parameters ?? [])],
    responses: {
      ...operation.responses,
      "409": {
        ...existingConflict,
        content: {
          ...problemContent(),
          ...existingConflict?.content,
        },
        description: conflictDescriptions.filter(Boolean).join("; "),
      },
    },
  };
}
