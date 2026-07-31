import { operationPolicyForRequest } from "./operation-policy";

export function readShapedProjectPostScope(method: string, path: string[]) {
  const declared = operationPolicyForRequest(method, path);
  return method === "POST" && path[0] === "projects" && declared?.projectAccess === "read"
    ? declared.requiredScope
    : undefined;
}

export function isReadShapedProjectPostRoute(method: string, path: string[]) {
  return readShapedProjectPostScope(method, path) !== undefined;
}
