import "server-only";
import { payloadHash } from "@/lib/ai-tracking/identity";
import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import { assertOperationAccess } from "@/lib/operations/access-extension";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { decryptProviderCredentials } from "@/lib/providers/crypto";

export async function trackingAdmissionContext(
  projectId: string,
  connectionId?: string,
  purchased = false,
) {
  if (!purchased) await assertOperationAccess(projectId);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, writeMode: true, budgetCapCents: true },
  });
  if (!purchased) assertProjectWritable(project);
  const connection = await prisma.providerConnection.findFirst({
    where: {
      ...(connectionId ? { id: connectionId } : {}),
      projectId,
      provider: "dataforseo",
      credentialSource: "own",
      ...(purchased ? {} : { enabled: true, status: "connected" as const }),
    },
  });
  if (!project || !connection?.credentialsEncrypted)
    throw new Error("Connect an enabled own DataForSEO credential before tracking.");
  const credentials = decryptProviderCredentials(connection.credentialsEncrypted);
  if (!credentials.login || !credentials.password)
    throw new Error("Stored tracking credential is unusable.");
  const credentialVersion = ownCredentialVersion(
    connection.provider,
    connection.id,
    connection.credentialsEncrypted,
  );
  if (!credentialVersion) throw new Error("Tracking requires a versioned stored credential.");
  const budgetRevision = payloadHash([
    project.budgetCapCents,
    connection.allocationAmountPerMonth,
    connection.programmaticAllocationAmountPerMonth,
  ]);
  return { project, connection, credentials, credentialVersion, budgetRevision };
}
