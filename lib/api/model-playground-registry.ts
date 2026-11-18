import {
  modelPlaygroundCatalogInputSchema,
  modelPlaygroundCreateSchema,
  modelPlaygroundPreviewInputSchema,
} from "./model-playground-schemas";
import type { SdkOperationExtensions } from "./openapi-sdk-operations";
import { noInput, zodInput } from "./operation-input-helpers";
import { policy } from "./operation-policy-helpers";

const base = "/projects/{project_id}/model-playground";
export const modelPlaygroundPolicies = {
  getModelPlaygroundCatalog: policy("GET", `${base}/catalog`, "read"),
  /** Read scope and read project access: a non-binding estimate computed in memory. It stores
   * nothing, so it works on read-only projects and never records an "acted" activity. */
  estimateModelPlaygroundRun: policy("POST", `${base}/runs/estimate`, "read", "read"),
  previewModelPlaygroundRun: policy("POST", `${base}/runs/preview`, "write", "write"),
  createModelPlaygroundRun: policy("POST", `${base}/runs`, "write", "write", {
    action: "update",
    resourceType: "project",
  }),
  getModelPlaygroundRun: policy("GET", `${base}/runs/{run_id}`, "read"),
} as const;
export const modelPlaygroundInputs = {
  getModelPlaygroundCatalog: { query: zodInput(modelPlaygroundCatalogInputSchema) },
  estimateModelPlaygroundRun: { body: zodInput(modelPlaygroundPreviewInputSchema) },
  previewModelPlaygroundRun: { body: zodInput(modelPlaygroundPreviewInputSchema) },
  createModelPlaygroundRun: { body: zodInput(modelPlaygroundCreateSchema) },
  getModelPlaygroundRun: noInput,
};
export const modelPlaygroundSdkOperations: Record<string, SdkOperationExtensions> =
  Object.fromEntries(
    Object.keys(modelPlaygroundPolicies).map((id) => [
      id,
      {
        "x-bisibility-sdk": {
          group:
            id === "getModelPlaygroundCatalog" ? "modelPlayground.catalog" : "modelPlayground.runs",
          method:
            id === "getModelPlaygroundCatalog" || id === "getModelPlaygroundRun"
              ? "get"
              : id === "previewModelPlaygroundRun"
                ? "preview"
                : id === "estimateModelPlaygroundRun"
                  ? "estimate"
                  : "create",
          legacy: { ts: [], python: [], go: [] },
        },
        "x-bisibility-idempotency": id === "createModelPlaygroundRun" ? "required" : "none",
        "x-bisibility-pagination": { style: "none" },
      },
    ]),
  );
/** V1 history uses report operations; saving a manual preset is deliberately app-only. */
export const modelPlaygroundAppOnlyOperations = ["saveModelPlaygroundPreset"] as const;

/** The persisted native run has a UUID, not a prefixed core resource ID. */
export const modelPlaygroundRunIdContract = {
  operationId: "getModelPlaygroundRun",
  path: `${base}/runs/{run_id}`,
  parameter: "run_id",
  schema: { type: "string", format: "uuid" },
} as const;
