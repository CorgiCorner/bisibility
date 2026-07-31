import type { ApiScope } from "./auth";
import { operationPolicyForRequest } from "./operation-policy";
import { hasApiScope } from "./scope-policy";

export function requiredScope(method: string, path: string[]): ApiScope {
  const declared = operationPolicyForRequest(method, path);
  if (!declared) {
    throw new Error(`API route ${method} /${path.join("/")} has no operation policy`);
  }
  return declared.requiredScope;
}

export function hasScope(scopes: readonly ApiScope[], required: ApiScope) {
  return hasApiScope(scopes, required);
}
