import "server-only";

import type { ProviderCredentials } from "@/lib/providers/types";

export async function deploymentProviderCredentials(
  _providerId: string,
): Promise<ProviderCredentials | null> {
  return null;
}
