import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  credentialsForProviderTest,
  restoreProviderAfterSuccessfulTest,
} from "@/lib/providers/auth-recovery";
import { credentialsFromInput } from "@/lib/providers/credentials-input";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import type { TestProviderConnectionInput } from "@/lib/schemas/provider";
import { auditProviderMutation } from "./provider-audit";
import { probeProviderConnection } from "./provider-verification";
import { requireApiPublicId } from "./public-id";

type ProviderMutationContext = {
  actorId: string | null;
  projectId: string;
  projectPublicId?: string;
};

async function publicProjectId(context: ProviderMutationContext) {
  if (context.projectPublicId) return requireApiPublicId(context.projectPublicId, "prj");
  const project = await prisma.project.findUnique({
    select: { publicId: true },
    where: { id: context.projectId },
  });
  return requireApiPublicId(project?.publicId ?? "", "prj");
}

export async function testProviderConnection(
  input: TestProviderConnectionInput,
  context: ProviderMutationContext,
) {
  const item = PROVIDER_CATALOG.find((provider) => provider.id === input.providerId);
  if (!item) throw new Error(`Unknown provider: ${input.providerId}`);
  const targetId = await publicProjectId(context);
  try {
    const credentials = await credentialsForProviderTest(
      context.projectId,
      item.id,
      credentialsFromInput(input),
    );
    const result = await probeProviderConnection({
      credentials,
      projectId: context.projectId,
      provider: item,
    });
    await restoreProviderAfterSuccessfulTest({
      ok: result.ok,
      projectId: context.projectId,
      providerId: item.id,
      testInput: input,
    });
    await auditProviderMutation({
      action: "provider.test",
      actorId: context.actorId,
      after: { ok: result.ok, provider: item.id },
      projectId: context.projectId,
      targetId,
      targetType: "project",
    });
    return result;
  } catch (error) {
    const result = {
      message: error instanceof Error ? error.message : "Provider connection test failed.",
      ok: false,
    };
    await auditProviderMutation({
      action: "provider.test_failed",
      actorId: context.actorId,
      after: { message: result.message, provider: item.id },
      projectId: context.projectId,
      targetId,
      targetType: "project",
    });
    return result;
  }
}
