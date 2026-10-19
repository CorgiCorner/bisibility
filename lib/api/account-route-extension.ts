import type { PersonalApiContext } from "@/lib/api/context";
import type { OperationPolicy } from "@/lib/api/operation-policy-helpers";

export type AccountRouteExtensionPolicy = OperationPolicy & { operationId: string };

/** Deployment-specific personal-token operations under /me; none in self-host builds. */
export function accountRouteExtensionPolicy(
  _method: string,
  _path: readonly string[],
): AccountRouteExtensionPolicy | undefined {
  return undefined;
}

export function dispatchAccountRouteExtension(_ctx: PersonalApiContext): Promise<Response> | null {
  return null;
}
