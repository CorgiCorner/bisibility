import "server-only";
import type { AssistantModel } from "@/lib/assistant/model-config";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { canProjectAction, hasProjectCapability } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, Role } from "@/lib/generated/prisma/client";
import { AssistantRequestError, assistantProject } from "./access";
import { assistantCreditsEnabled, creditsFundingOption } from "./funding-extension";
import {
  creditsLimitReached,
  fundingServes,
  resolveAssistantFunding,
  storedFundingMode,
} from "./funding-resolve";
import {
  type ProjectModelCredential,
  readProjectModelCredential,
} from "./project-model-credential";
import {
  ASSISTANT_PROVIDERS,
  type AssistantProvider,
  type FundingOptionView,
  fundingPreferenceRequestSchema,
} from "./wire";

function closedCredits(provider: AssistantProvider): FundingOptionView {
  return {
    mode: "credits",
    provider,
    available: false,
    reason: "not_configured",
    usage: null,
    credential: null,
  };
}

type FundingProject = { id: string; ownerId: string; role: Role };

/** Credits need the assistant.use capability; a role without it gets a clear refusal, never a charge. */
async function creditsOptionFor(
  userId: string,
  provider: AssistantProvider,
  models: readonly AssistantModel[],
  project: FundingProject,
): Promise<FundingOptionView> {
  if (!hasProjectCapability(project.role, "assistant.use"))
    return {
      mode: "credits",
      provider,
      available: false,
      reason: "credits_not_permitted",
      usage: null,
      credential: null,
    };
  return creditsFundingOption(userId, provider, models, project);
}

/** Funding rows for every direct provider, plus the stored shared project choice. */
export async function assistantFundingState(
  userId: string,
  project: FundingProject,
  models: readonly AssistantModel[],
  enabled: boolean,
) {
  const [credentials, storedRows, projectCredentials] = await Promise.all([
    prisma.assistantCredential.findMany({
      where: { userId },
      select: { id: true, provider: true, last4: true, status: true },
    }),
    prisma.projectAiFundingPreference.findMany({
      where: { projectId: project.id },
      select: { provider: true, mode: true },
    }),
    Promise.all(
      ASSISTANT_PROVIDERS.map((provider) =>
        readProjectModelCredential(prisma, project.id, userId, provider),
      ),
    ),
  ]);
  const funding: FundingOptionView[] = [];
  for (const provider of ASSISTANT_PROVIDERS) {
    const credential =
      projectCredentials.find((item) => item?.provider === provider) ??
      credentials.find((item) => item.provider === provider);
    const hasModel = models.some((model) => model.provider === provider);
    funding.push({
      mode: "byok",
      provider,
      available: enabled && hasModel && credential?.status === "active",
      reason: !enabled
        ? "not_configured"
        : !hasModel
          ? "model_unavailable"
          : !credential
            ? "byok_missing"
            : credential.status !== "active"
              ? "byok_invalid"
              : null,
      usage: null,
      credential: credential
        ? {
            id: credential.id,
            last4: credential.last4,
            status: credential.status === "active" ? "active" : "invalid",
          }
        : null,
    });
    funding.push(
      enabled ? await creditsOptionFor(userId, provider, models, project) : closedCredits(provider),
    );
  }
  return {
    funding,
    stored: storedRows.flatMap((row) => {
      const mode = storedFundingMode(row.mode);
      const provider = ASSISTANT_PROVIDERS.find((item) => item === row.provider);
      return mode && provider ? [{ provider, mode }] : [];
    }),
    creditsEnabled: assistantCreditsEnabled(),
  };
}

export async function resolveTurnFunding(
  tx: Prisma.TransactionClient,
  userId: string,
  project: FundingProject,
  model: AssistantModel,
  models: readonly AssistantModel[],
) {
  if (!hasProjectCapability(project.role, "assistant.use"))
    throw new AssistantRequestError("permission_denied", 403);
  await tx.$queryRaw`SELECT id FROM projects WHERE id=${project.id} FOR SHARE`;
  const [storedRow, credential, credit] = await Promise.all([
    tx.projectAiFundingPreference.findUnique({
      where: {
        projectId_provider: { projectId: project.id, provider: model.provider },
      },
      select: { mode: true },
    }),
    readProjectModelCredential(
      tx,
      project.id,
      userId,
      model.provider,
    ).then<ProjectModelCredential | null>(
      (projectKey) =>
        projectKey ??
        tx.assistantCredential.findUnique({
          where: { userId_provider: { userId, provider: model.provider } },
        }),
    ),
    creditsOptionFor(userId, model.provider, models, project),
  ]);
  const byok: FundingOptionView = {
    mode: "byok",
    provider: model.provider,
    available: credential?.status === "active",
    reason: credential?.status === "active" ? null : credential ? "byok_invalid" : "byok_missing",
    usage: null,
    credential: credential
      ? {
          id: credential.id,
          last4: credential.last4,
          status: credential.status === "active" ? "active" : "invalid",
        }
      : null,
  };
  const credits: FundingOptionView = {
    mode: "credits",
    provider: model.provider,
    available: credit.available,
    reason: credit.reason,
    usage: credit.usage,
    credential: null,
  };
  const choice = resolveAssistantFunding({
    stored: storedFundingMode(storedRow?.mode),
    provider: model.provider,
    options: [byok, credits],
    creditsEnabled: assistantCreditsEnabled(),
  });
  const option = choice.mode === "byok" ? byok : credits;
  if (!fundingServes(option)) throw new AssistantRequestError(fundingRefusal(option), 403);
  return { choice, credential: choice.mode === "byok" ? credential : null };
}

export function fundingRefusal(option: FundingOptionView | undefined) {
  if (!option) return "not_configured" as const;
  if (option.available && creditsLimitReached(option)) return "limit_exceeded" as const;
  return option.reason ?? ("not_configured" as const);
}

/** The turn uses the stored choice. A client-sent mode is not part of the contract. */
export function fundingForModel(
  state: Awaited<ReturnType<typeof assistantFundingState>>,
  provider: AssistantProvider,
) {
  const choice = resolveAssistantFunding({
    stored: state.stored.find((item) => item.provider === provider)?.mode ?? null,
    provider,
    options: state.funding,
    creditsEnabled: state.creditsEnabled,
  });
  const option = state.funding.find(
    (item) => item.provider === choice.provider && item.mode === choice.mode,
  );
  return { choice, option };
}

export async function saveAssistantFundingPreference(userId: string, input: unknown) {
  const value = fundingPreferenceRequestSchema.parse(input);
  if (value.mode === "credits" && !assistantCreditsEnabled())
    throw new AssistantRequestError("credits_unavailable", 403);
  const project = await assistantProject(value.project, userId);
  if (!canProjectAction(project.role, "manage", "provider_connection"))
    throw new AssistantRequestError("permission_denied", 403);
  return prisma.$transaction(async (tx) => {
    // Also locks the absence of a preference against a concurrent first insert.
    await tx.$queryRaw`SELECT id FROM projects WHERE id=${project.id} FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT id FROM memberships WHERE "userId"=${userId} AND "projectId"=${project.id} FOR SHARE`;
    const [currentProject, membership] = await Promise.all([
      tx.project.findUnique({ where: { id: project.id }, select: { ownerId: true } }),
      tx.membership.findUnique({
        where: { userId_projectId: { userId, projectId: project.id } },
        select: { role: true },
      }),
    ]);
    const role = currentProject?.ownerId === userId ? "owner" : membership?.role;
    if (!canProjectAction(role, "manage", "provider_connection"))
      throw new AssistantRequestError("permission_denied", 403);
    const current = await tx.projectAiFundingPreference.findUnique({
      where: {
        projectId_provider: {
          projectId: project.id,
          provider: value.provider,
        },
      },
      select: { mode: true },
    });
    const previous = storedFundingMode(current?.mode);
    if (previous === value.mode) return { mode: value.mode, provider: value.provider };
    await tx.projectAiFundingPreference.upsert({
      where: {
        projectId_provider: {
          projectId: project.id,
          provider: value.provider,
        },
      },
      create: { projectId: project.id, provider: value.provider, mode: value.mode },
      update: { mode: value.mode },
    });
    // Key changes and the AI limit are audited, so the project's funding choice is too.
    await writeAudit(
      {
        action: "assistant.funding.updated",
        actorId: userId,
        before: { mode: previous ?? "unset", provider: value.provider },
        after: { mode: value.mode, provider: value.provider },
        projectId: project.id,
        targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
        targetType: "project",
      },
      tx,
    );
    return { mode: value.mode, provider: value.provider };
  });
}
