import "server-only";

import { prisma } from "@/lib/db/prisma";
import { resolveProviderCredentialsWithOverrides } from "@/lib/providers/credentials";
import type { ProviderCredentials } from "@/lib/providers/types";
import type { TestProviderConnectionInput } from "@/lib/schemas/provider";

export async function credentialsForProviderTest(
  projectId: string,
  providerId: string,
  inputCredentials: ProviderCredentials,
) {
  const connection = await prisma.providerConnection.findUnique({
    select: { credentialsEncrypted: true },
    where: { projectId_provider: { projectId, provider: providerId } },
  });
  return resolveProviderCredentialsWithOverrides(
    providerId,
    connection?.credentialsEncrypted,
    inputCredentials,
  );
}

function hasCredentialOverride(input: TestProviderConnectionInput) {
  return Boolean(
    input.login ||
      input.secret ||
      input.credentials?.apiKey ||
      input.credentials?.endpoint ||
      input.credentials?.login ||
      input.credentials?.secret,
  );
}

export async function restoreProviderAfterSuccessfulTest(input: {
  ok: boolean;
  projectId: string;
  providerId: string;
  testInput: TestProviderConnectionInput;
}) {
  if (!input.ok || hasCredentialOverride(input.testInput)) return false;
  const restored = await prisma.providerConnection.updateMany({
    data: { status: "connected" },
    where: {
      projectId: input.projectId,
      provider: input.providerId,
      status: "needs_reauth",
    },
  });
  return restored.count > 0;
}
