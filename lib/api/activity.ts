import { recordUserActivity } from "@/lib/activity/record-extension";
import type { ApiAuth } from "./auth";
import type { OperationPolicy } from "./operation-policy-helpers";
import type { ApiScope } from "./scope-policy";

export function recordApiSeen(auth: ApiAuth, mcp: boolean) {
  if (mcp || auth.kind !== "personal_token") return null;
  const activity = {
    userId: auth.user.id,
    email: auth.user.email,
    channel: "api" as const,
    interactive: true,
  };
  recordUserActivity({ ...activity, kind: "seen" });
  return activity;
}

export function recordApiAction(
  activity: ReturnType<typeof recordApiSeen>,
  method: string,
  operation: OperationPolicy & { operationId: string },
  scope: ApiScope,
) {
  if (
    activity &&
    method !== "GET" &&
    operation.projectAccess === "write" &&
    !(operation.requiredScope === "write" && scope === "read") &&
    !["registerDevicePushToken", "deleteDevicePushToken"].includes(operation.operationId)
  ) {
    recordUserActivity({ ...activity, kind: "acted" });
  }
}
