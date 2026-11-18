import "server-only";
import { readAssistantKillSwitch } from "@/lib/assistant/kill-switch";
import { hasProjectCapability } from "@/lib/auth/capabilities";
import { lockResourceOwners } from "@/lib/capacity/resource-lock";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import type { Prisma, Role } from "@/lib/generated/prisma/client";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { assertModelFundingBinding } from "./funding-extension";
import { ModelAdmissionRefusal, type ModelPaymentQuote } from "./payment";

/** Owner capacity lock matches account resource admission and transfer ordering. */
export async function lockModelPaymentActor(
  tx: Prisma.TransactionClient,
  quote: ModelPaymentQuote,
) {
  const c = quote.context;
  await lockResourceOwners(tx, [c.principal]);
  await tx.$queryRaw`SELECT id FROM users WHERE id=${c.actorId} FOR SHARE`;
  const [project] = await tx.$queryRaw<
    { ownerId: string; writeMode: string }[]
  >`SELECT "ownerId","writeMode" FROM projects WHERE id=${c.projectId} FOR SHARE`;
  const [actor] = await tx.$queryRaw<
    { deactivatedAt: Date | null }[]
  >`SELECT "deactivatedAt" FROM users WHERE id=${c.actorId}`;
  const [membership] = await tx.$queryRaw<{ role: Role }[]>`
    SELECT role FROM memberships WHERE "userId"=${c.actorId} AND "projectId"=${c.projectId} FOR SHARE`;
  if (
    !actor ||
    actor.deactivatedAt ||
    project?.ownerId !== c.principal ||
    isProjectReadOnly(project?.writeMode) ||
    !hasProjectCapability(
      c.actorId === project.ownerId ? "owner" : membership?.role,
      "assistant.use",
    )
  )
    throw new ModelAdmissionRefusal("access_denied");
}

export async function assertModelPaymentConnections(
  tx: Prisma.TransactionClient,
  quote: ModelPaymentQuote,
) {
  // Read at both admission and the transport fence; a previously accepted quote is not an override.
  if ((await readAssistantKillSwitch(tx)) === "all_off")
    throw new ModelAdmissionRefusal("service_paused");
  const bindings = [...quote.context.columns].sort((a, b) =>
    a.binding.connectionId.localeCompare(b.binding.connectionId),
  );
  for (const { binding: b } of bindings) {
    await assertModelFundingBinding(tx, b, quote.context.actorId);
    if (b.fundingSource === "platform") {
      continue;
    }
    const [connection] = await tx.$queryRaw<
      {
        projectId: string;
        publicId: string;
        provider: string;
        kind: string;
        credentialSource: string;
        enabled: boolean;
        status: string;
        credentialsEncrypted: string | null;
      }[]
    >`SELECT * FROM provider_connections WHERE id=${b.connectionId} FOR SHARE`;
    if (
      !connection ||
      connection.projectId !== b.projectId ||
      connection.publicId !== b.column.connectionId ||
      connection.provider !== b.column.providerId ||
      connection.kind !== "model" ||
      connection.credentialSource !== "own" ||
      !connection.enabled ||
      connection.status !== "connected"
    )
      throw new ModelAdmissionRefusal("connection_unavailable");
    if (
      ownCredentialVersion(connection.provider, b.connectionId, connection.credentialsEncrypted) !==
      b.credentialVersion
    )
      throw new ModelAdmissionRefusal("credential_changed");
  }
}
