import type { OperationCapability } from "./operation-capabilities";
import type { ApiMethod, ProjectAccess } from "./operation-policy";
import type { ApiScope } from "./scope-policy";

export type OperationPolicy = {
  capability?: OperationCapability;
  method: ApiMethod;
  path: string;
  projectAccess: ProjectAccess;
  requiredScope: ApiScope;
};

export function policy(
  method: ApiMethod,
  path: string,
  requiredScope: ApiScope,
  projectAccess: ProjectAccess = method === "GET" ? "read" : "write",
  capability?: OperationCapability,
): OperationPolicy {
  return { method, path, projectAccess, requiredScope, ...(capability ? { capability } : {}) };
}
