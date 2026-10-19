import "server-only";

import { prisma } from "@/lib/db/prisma";
import { OwnProviderKeyRequiredError } from "./execution-extension-errors";
import { ownProviderKeysRequired } from "./own-key-policy-extension";
import { storedProviderCredentialsPresent } from "./stored-credentials";

/**
 * An own connection with nothing usable stored resolves to environment credentials, a self-host
 * convenience. For an account that must use its own keys that fallback would spend keys it does
 * not own, so a paid dispatch on such a connection is refused before any provider call.
 */
export async function assertOwnKeyStored(input: {
  capability: string;
  credentialsEncrypted: string | null | undefined;
  projectId: string;
  provider: string;
}): Promise<void> {
  if (storedProviderCredentialsPresent(input.credentialsEncrypted)) return;
  const project = await prisma.project.findUnique({
    select: { ownerId: true },
    where: { id: input.projectId },
  });
  if (!project || !(await ownProviderKeysRequired(project.ownerId))) return;
  throw new OwnProviderKeyRequiredError({
    capability: input.capability,
    projectId: input.projectId,
    provider: input.provider,
  });
}
