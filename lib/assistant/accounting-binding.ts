import { isProjectModelCredential, readProjectModelCredential } from "./project-model-credential";
import "server-only";
import { hasProjectCapability } from "@/lib/auth/capabilities";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ASSISTANT_METERING_NAMESPACE, type AssistantAccountingBinding } from "./accounting-scope";
import { type AssistantEffort, runAssistantEffort } from "./effort";
import { storedFundingMode } from "./funding-resolve";
import { killSwitchRefusal, readAssistantKillSwitch } from "./kill-switch";
import { remainingAssistantOutput, runAssistantOutputLimit } from "./limits";
import { type AssistantModel, parseAssistantModels } from "./model-config";
import type { AssistantErrorCode } from "./wire";

export class AssistantBindingError extends Error {
  constructor(readonly code: AssistantErrorCode) {
    super(code);
  }
}

/** Locks mutable funding and membership rows until the caller's admission transaction commits. */
export async function verifyAssistantBinding(
  tx: Prisma.TransactionClient,
  binding: AssistantAccountingBinding,
  _now = new Date(),
) {
  // The kill switch is read at every step, so a flip or a tripped breaker stops a running turn
  // before its next reservation.
  const killed = killSwitchRefusal(await readAssistantKillSwitch(tx), binding.funding);
  if (killed) throw new AssistantBindingError(killed);
  await tx.$queryRaw`SELECT id FROM assistant_runs WHERE id = ${binding.runId} FOR UPDATE`;
  const run = await tx.assistantRun.findUnique({
    where: { id: binding.runId },
    include: { conversation: true },
  });
  if (
    !run ||
    run.userId !== binding.userId ||
    run.projectId !== binding.projectId ||
    run.conversation.userId !== binding.userId ||
    run.conversation.projectId !== binding.projectId ||
    run.conversation.activeRunId !== run.id ||
    !["pending", "streaming", "running_tool"].includes(run.status)
  ) {
    throw new AssistantBindingError("permission_denied");
  }
  await tx.$queryRaw`SELECT m.id FROM memberships m JOIN projects p ON p.id=m."projectId"
    WHERE m."userId"=${binding.userId} AND m."projectId"=${binding.projectId} FOR SHARE OF m,p`;
  const [membership, project] = await Promise.all([
    tx.membership.findUnique({
      where: { userId_projectId: { userId: binding.userId, projectId: binding.projectId } },
      select: { id: true, role: true },
    }),
    tx.project.findUnique({ where: { id: binding.projectId }, select: { ownerId: true } }),
  ]);
  if (
    !membership ||
    !project ||
    project.ownerId !== binding.ownerId ||
    !hasProjectCapability(
      binding.userId === project.ownerId ? "owner" : membership.role,
      "assistant.use",
    )
  )
    throw new AssistantBindingError("permission_denied");
  const preference = await tx.projectAiFundingPreference.findUnique({
    where: {
      projectId_provider: { projectId: binding.projectId, provider: binding.model.provider },
    },
    select: { mode: true },
  });
  const selected = storedFundingMode(preference?.mode);
  if (
    selected &&
    selected !== binding.funding &&
    (selected !== "credits" || (await import("./funding-extension")).assistantCreditsEnabled())
  )
    throw new AssistantBindingError("permission_denied");
  const configured = parseAssistantModels(process.env.ASSISTANT_MODELS_JSON)?.find(
    (model) => model.id === run.modelId,
  );
  if (
    !configured ||
    // The bound model carries what is left of the run's output cap after its settled output.
    JSON.stringify({
      ...configured,
      maxOutputTokens: remainingAssistantOutput(
        runAssistantOutputLimit(configured, run.maxOutputTokens),
        run.outputTokens,
      ),
    }) !== JSON.stringify(binding.model) ||
    run.provider !== configured.provider ||
    run.funding !== binding.funding ||
    !sameRunEffort(configured, run.reasoningEffort, binding.effort)
  )
    throw new AssistantBindingError("model_unavailable");
  if (binding.namespace !== ASSISTANT_METERING_NAMESPACE)
    throw new AssistantBindingError("accounting_unavailable");
  if (binding.funding === "byok") {
    if (
      !binding.credentialId ||
      !binding.credentialVersion ||
      run.credentialId !== binding.credentialId ||
      run.credentialVersion !== binding.credentialVersion
    )
      throw new AssistantBindingError("byok_missing");
    const projectKey = isProjectModelCredential(binding.credentialId);
    if (!projectKey)
      await tx.$queryRaw`SELECT id FROM assistant_credentials WHERE id=${binding.credentialId} FOR UPDATE`;
    if (
      !projectKey &&
      (await readProjectModelCredential(
        tx,
        binding.projectId,
        binding.userId,
        binding.model.provider,
      ))
    )
      throw new AssistantBindingError("byok_invalid");
    const credential = projectKey
      ? await readProjectModelCredential(
          tx,
          binding.projectId,
          binding.userId,
          binding.model.provider,
          binding.credentialId,
        )
      : await tx.assistantCredential.findUnique({ where: { id: binding.credentialId } });
    if (
      !credential ||
      credential.userId !== binding.userId ||
      credential.provider !== run.provider ||
      credential.status !== "active" ||
      credential.versionHash !== binding.credentialVersion
    )
      throw new AssistantBindingError("byok_invalid");
    return { credential };
  }
  // A static import would cycle through the credits admission adapter.
  const { assertAssistantCreditsReady } = await import("./funding-extension");
  const code = await assertAssistantCreditsReady(tx, run.provider);
  if (code) throw new AssistantBindingError(code);
  return { credential: null };
}

function sameRunEffort(
  model: AssistantModel,
  stored: string | null,
  bound: AssistantEffort | null | undefined,
) {
  try {
    return runAssistantEffort(model, stored) === (bound ?? null);
  } catch {
    return false;
  }
}
