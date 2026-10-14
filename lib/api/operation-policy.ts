import type { OperationPolicy } from "./operation-policy-helpers";
import { operationPolicy } from "./operation-policy-registry";

/**
 * Project-role requirement an operation inherits from the app authorization table.
 * The router resolves it with `canProjectAction()` so API credentials and the UI
 * answer to the same rules.
 */
export type { OperationCapability } from "./operation-capabilities";
export { operationPolicy } from "./operation-policy-registry";
export type { ApiMethod, ProjectAccess } from "./operation-policy-types";

export type ApiOperationId = keyof typeof operationPolicy;

const policies = Object.entries(operationPolicy) as [ApiOperationId, OperationPolicy][];

function pathSegments(path: string | readonly string[]) {
  return typeof path === "string" ? path.split("/").filter(Boolean) : path;
}

function isParameter(segment: string) {
  return segment.startsWith("{") && segment.endsWith("}");
}

function pathsMatch(pattern: string, path: readonly string[]) {
  const patternSegments = pathSegments(pattern);
  return (
    patternSegments.length === path.length &&
    patternSegments.every((segment, index) => isParameter(segment) || segment === path[index])
  );
}

function staticSegmentCount(path: string) {
  return pathSegments(path).filter((segment) => !isParameter(segment)).length;
}

export function operationPolicyForRequest(
  method: string,
  path: readonly string[],
): (OperationPolicy & { operationId: ApiOperationId }) | undefined {
  const matches = policies
    .filter(([, candidate]) => candidate.method === method && pathsMatch(candidate.path, path))
    .sort(([, left], [, right]) => staticSegmentCount(right.path) - staticSegmentCount(left.path));
  const [match] = matches;
  return match ? { operationId: match[0], ...match[1] } : undefined;
}

function normalizedPath(path: string) {
  return path.replaceAll(/\{[^}]+\}/g, "{}");
}

export function assertOperationPolicy(
  operationId: string,
  method: string,
  path: string,
): asserts operationId is ApiOperationId {
  const declared = operationPolicy[operationId as ApiOperationId];
  if (!declared) {
    throw new Error(`API operation "${operationId}" is missing an operation policy`);
  }
  if (
    declared.method !== method.toUpperCase() ||
    normalizedPath(declared.path) !== normalizedPath(path)
  ) {
    throw new Error(`API operation "${operationId}" does not match its operation policy route`);
  }
}
