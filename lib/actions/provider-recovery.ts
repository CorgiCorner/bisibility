"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { checkRecoveryAccount } from "@/lib/integrations/provider-recovery/check-account";
import { readNotSentChecks } from "@/lib/integrations/provider-recovery/not-sent-checks";
import { accountHealthProviders } from "@/lib/providers/account-health/registry";
import { z } from "zod";
import { getActionActor, requireProjectScope, revalidateProviderViews } from "./_shared";

const inputSchema = z
  .object({ projectId: z.string().max(80), connectionId: z.string().max(80) })
  .strict();
const pageSchema = inputSchema
  .extend({ cursor: z.string().max(512).nullable(), until: z.iso.datetime() })
  .strict();

async function authorizeConnection(value: z.infer<typeof inputSchema>, write: boolean) {
  if (
    parsePublicId(value.projectId)?.prefix !== "prj" ||
    parsePublicId(value.connectionId)?.prefix !== "conn"
  )
    throw new Error("Invalid provider connection scope.");
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, write ? "manage" : "read", value.projectId, {
    type: "provider_connection",
  });
  const connection = await prisma.providerConnection.findFirstOrThrow({
    where: {
      publicId: value.connectionId,
      projectId: project.id,
      provider: { in: accountHealthProviders() },
      credentialSource: "own",
    },
    select: { id: true },
  });
  return { actor, project, connection };
}

export async function checkProviderRecoveryAccount(value: unknown) {
  const input = inputSchema.parse(value);
  const { actor, project } = await authorizeConnection(input, true);
  const result = await checkRecoveryAccount({
    projectId: project.id,
    projectPublicId: project.publicId,
    connectionPublicId: input.connectionId,
    actorId: actor.id,
  });
  if (result.accountState === "verified") recordAppAction(actor);
  revalidateProviderViews();

  return result;
}

export async function loadProviderAffectedChecks(value: unknown) {
  const input = pageSchema.parse(value);
  const { project, connection } = await authorizeConnection(input, false);
  return readNotSentChecks(project.id, connection.id, input.cursor, new Date(input.until));
}
