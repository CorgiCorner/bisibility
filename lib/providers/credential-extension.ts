import "server-only";

import type { ProviderCredentials } from "@/lib/providers/types";

export async function deploymentProviderCredentials(
  _providerId: string,
  _purpose?: "free_catalog",
): Promise<ProviderCredentials | null> {
  return null;
}
