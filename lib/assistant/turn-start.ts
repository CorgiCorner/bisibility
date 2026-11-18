import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { AssistantRequestError, assistantEnabled, assistantProject } from "./access";
import { expireAssistantApprovals } from "./approval-expiry";
import { resolveAssistantEffort } from "./effort";
import { resolveTurnFunding } from "./funding-preference";
import { assertAssistantNotKilled } from "./kill-switch";
import { resolveAssistantOutputLimit } from "./limits";
import { parseAssistantModels } from "./model-config";
import { assertTeamTurnAllowed } from "./team-limits";
import { turnRequestSchema } from "./wire";

/** Serializes new-conversation request IDs and claims one active run per conversation. */
export async function startAssistantTurn(userId: string, input: unknown) {
  const request = turnRequestSchema.parse(input);
  if (!assistantEnabled()) throw new AssistantRequestError("not_configured", 503);
  const models = parseAssistantModels(process.env.ASSISTANT_MODELS_JSON);
  if (!models) throw new AssistantRequestError("not_configured", 503);
  const model = models.find((item) => item.id === request.modelId);
  if (!model) throw new AssistantRequestError("model_unavailable", 400);
  const effort = resolveAssistantEffort(model, request.effort);
  if (effort === undefined) throw new AssistantRequestError("invalid_request", 400);
  // A per-turn output cap above the model's catalog maximum is refused, never lowered silently.
  const outputLimit = resolveAssistantOutputLimit(model, request.maxOutputTokens);
  if (outputLimit === undefined) throw new AssistantRequestError("invalid_request", 400);
  const project = await assistantProject(request.project, userId);
  if (request.conversationId) {
    // An approval nobody answered in time must not keep the conversation busy forever.
    const conversationId = request.conversationId;
    await prisma.$transaction(async (tx) => {
      const active = await tx.assistantConversation.findFirst({
        where: { id: conversationId, userId, projectId: project.id },
        select: { activeRunId: true },
      });
      if (active?.activeRunId) await expireAssistantApprovals(tx, active.activeRunId);
    });
  }
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`assistant-turn:${userId}:${request.requestId}`},0))`;
      await tx.$queryRaw`SELECT id FROM memberships WHERE "userId"=${userId} AND "projectId"=${project.id} FOR SHARE`;
      const membership = await tx.membership.findUnique({
        where: { userId_projectId: { userId, projectId: project.id } },
        select: { id: true },
      });
      if (!membership) throw new AssistantRequestError("permission_denied", 404);
      if (!request.conversationId) {
        const existing = await tx.assistantRun.findFirst({
          where: { userId, projectId: project.id, requestId: request.requestId },
          select: { id: true, conversationId: true },
        });
        if (existing)
          return {
            duplicate: true as const,
            runId: existing.id,
            conversationId: existing.conversationId,
          };
      }
      let conversation = request.conversationId
        ? await tx.assistantConversation.findFirst({
            where: { id: request.conversationId, userId, projectId: project.id },
          })
        : null;
      if (request.conversationId && !conversation)
        throw new AssistantRequestError("permission_denied", 404);
      if (!conversation)
        conversation = await tx.assistantConversation.create({
          data: {
            projectId: project.id,
            userId,
            title: (request.text ?? "Assistant conversation").slice(0, 80),
          },
        });
      const existing = await tx.assistantRun.findUnique({
        where: {
          conversationId_requestId: {
            conversationId: conversation.id,
            requestId: request.requestId,
          },
        },
        select: { id: true },
      });
      if (existing)
        return { duplicate: true as const, runId: existing.id, conversationId: conversation.id };
      if (conversation.activeRunId) throw new AssistantRequestError("conversation_busy", 409);
      let userText = request.text;
      if (request.retryOfRunId) {
        const old = await tx.assistantRun.findFirst({
          where: {
            id: request.retryOfRunId,
            conversationId: conversation.id,
            userId,
            status: { in: ["failed", "cancelled"] },
          },
        });
        if (!old) throw new AssistantRequestError("invalid_request", 400);
        const oldAnswer = await tx.assistantMessage.findFirst({
          where: { conversationId: conversation.id, runId: old.id, role: "assistant" },
          select: { seq: true },
        });
        const message = oldAnswer
          ? await tx.assistantMessage.findFirst({
              where: { conversationId: conversation.id, role: "user", seq: { lt: oldAnswer.seq } },
              orderBy: { seq: "desc" },
            })
          : null;
        if (!message || !Array.isArray(message.parts))
          throw new AssistantRequestError("invalid_request", 400);
        const part = message.parts.find(
          (item): item is Prisma.JsonObject =>
            typeof item === "object" &&
            item !== null &&
            !Array.isArray(item) &&
            item.type === "text" &&
            typeof item.text === "string",
        );
        if (!part || typeof part.text !== "string")
          throw new AssistantRequestError("invalid_request", 400);
        userText = part.text;
      }
      if (!userText) throw new AssistantRequestError("invalid_request", 400);
      const { choice, credential } = await resolveTurnFunding(tx, userId, project, model, models);
      // Before any run, reservation or provider call: a paused path is refused with no charge.
      await assertAssistantNotKilled(choice.mode, tx);
      // Credits only: the team's daily hosted spend and simultaneous-turn caps.
      if (choice.mode === "credits") await assertTeamTurnAllowed(tx, project.id);
      const run = await tx.assistantRun.create({
        data: {
          conversationId: conversation.id,
          projectId: project.id,
          userId,
          status: "pending",
          provider: model.provider,
          modelId: model.id,
          reasoningEffort: effort,
          maxOutputTokens: outputLimit,
          funding: choice.mode,
          credentialId: credential?.id,
          credentialVersion: credential?.versionHash,
          requestId: request.requestId,
        },
      });
      const claim = await tx.assistantConversation.updateMany({
        where: { id: conversation.id, userId, projectId: project.id, activeRunId: null },
        data: { activeRunId: run.id },
      });
      if (claim.count !== 1) throw new AssistantRequestError("conversation_busy", 409);
      const max = await tx.assistantMessage.aggregate({
        where: { conversationId: conversation.id },
        _max: { seq: true },
      });
      let seq = (max._max.seq ?? 0) + 1;
      const userMessage = request.retryOfRunId
        ? null
        : await tx.assistantMessage.create({
            data: {
              conversationId: conversation.id,
              seq: seq++,
              role: "user",
              parts: [{ type: "text", text: userText }],
              runId: run.id,
            },
          });
      const assistantMessage = await tx.assistantMessage.create({
        data: { conversationId: conversation.id, seq, role: "assistant", parts: [], runId: run.id },
      });
      return {
        duplicate: false as const,
        run,
        conversation,
        model,
        userText,
        userMessage,
        assistantMessage,
        request,
        project,
      };
    },
    { timeout: 30000 },
  );
}
