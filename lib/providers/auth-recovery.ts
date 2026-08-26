import "server-only";

import { prisma } from "@/lib/db/prisma";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
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
  const restored = await prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, input.projectId);
    const current = await tx.providerConnection.findUnique({
      where: {
        projectId_provider: { projectId: input.projectId, provider: input.providerId },
      },
    });
    if (current?.status !== "needs_reauth") return { count: 0 };
    const result = await tx.providerConnection.updateMany({
      data: { status: "connected" },
      where: { id: current.id, status: "needs_reauth" },
    });
    return result;
  });
  return restored.count > 0;
}
