import type { SdkOperationExtensions } from "./openapi-sdk-operations";

function write(method: string, idempotency: "none" | "optional"): SdkOperationExtensions {
  return {
    "x-bisibility-sdk": {
      group: "schedules",
      method,
      legacy: { ts: [], python: [], go: [] },
    },
    "x-bisibility-idempotency": idempotency,
    "x-bisibility-pagination": { style: "none" },
  };
}

export const sdkWave5Operations: Record<string, SdkOperationExtensions> = {
  previewSchedule: write("preview", "none"),
  createSchedule: write("create", "none"),
  updateSchedule: write("update", "none"),
  listSchedules: {
    "x-bisibility-sdk": {
      group: "schedules",
      method: "list",
      legacy: { ts: [], python: [], go: [] },
    },
    "x-bisibility-idempotency": "none",
    "x-bisibility-pagination": {
      style: "cursor",
      items: "data",
      next: "meta.next_cursor",
      max_limit: 200,
    },
  },
  getSchedule: {
    "x-bisibility-sdk": {
      group: "schedules",
      method: "get",
      legacy: { ts: [], python: [], go: [] },
    },
    "x-bisibility-idempotency": "none",
    "x-bisibility-pagination": { style: "none" },
  },
};
export const sdkWave5ReadyOperationIds = Object.keys(sdkWave5Operations);
