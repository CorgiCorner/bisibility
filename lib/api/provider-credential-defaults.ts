import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ProviderCatalogItem, ProviderCredentials } from "@/lib/providers/types";
import { trackedProjectDomain } from "@/lib/schemas/project";

/**
 * Fills provider-specific credential defaults from the project. Plausible's login is the
 * site domain, which is the tracked project domain for almost every project.
 */
export async function withProviderCredentialDefaults(
  provider: Pick<ProviderCatalogItem, "id" | "loginDefaultsToProjectDomain">,
  projectId: string,
  credentials: ProviderCredentials,
  client: Pick<typeof prisma, "project"> = prisma,
): Promise<ProviderCredentials> {
  if (!provider.loginDefaultsToProjectDomain || credentials.login?.trim()) return credentials;
  const project = await client.project.findUnique({
    select: { domain: true },
    where: { id: projectId },
  });
  const domain = trackedProjectDomain(project?.domain);
  return domain ? { ...credentials, login: domain } : credentials;
}
