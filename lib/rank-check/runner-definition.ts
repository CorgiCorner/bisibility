import "server-only";
import { composePaymentGuards } from "@/lib/action-payment/compose-guards";
import { prisma } from "@/lib/db/prisma";
import { DefinitionUnavailableError } from "@/lib/measurement-definitions/errors";
import { assertSnapshotDefinitionSession } from "@/lib/measurement-definitions/snapshot-dispatch";
import {
  frozenRunnerInput,
  liveWorkerDefinition,
} from "@/lib/measurement-definitions/worker-session";
import type { RunCheckInput } from "./runner";

function withPayment(input: RunCheckInput) {
  if (!input.payment) return input;
  const guards = composePaymentGuards(
    { beforeReserve: input.definitionBeforeReserve, beforeFence: input.definitionFence },
    input.payment.guard,
  );
  return {
    ...input,
    definitionBeforeReserve: guards.beforeReserve,
    definitionFence: guards.beforeFence,
  };
}
/** Actual default organic/continuation composition before credentials, pricing, admission or transport. */
export async function prepareRunnerDefinition(original: RunCheckInput, providerId: string) {
  if (providerId !== original.connection.provider) throw new DefinitionUnavailableError();
  const continuation = original.definitionContinuation;
  if (continuation) {
    assertSnapshotDefinitionSession(continuation);
    const binding = continuation.binding;
    if (
      providerId !== "serpapi" ||
      original.projectId !== binding.projectId ||
      original.keyword.id !== binding.keywordId ||
      original.rankCheckId !== binding.rankCheckId ||
      original.connection.id !== binding.connectionId
    )
      throw new DefinitionUnavailableError();
    const input: RunCheckInput = {
      ...original,
      depth: binding.requestDepth,
      stopOnMatch: false,
      definitionFence: continuation.beforeFence,
      definitionBeforeReserve: continuation.beforeReserve,
      keyword: {
        ...original.keyword,
        text: binding.context.keyword,
        domain: binding.context.domain,
        device: binding.context.device,
        location: binding.context.location,
      },
    };
    return { input: withPayment(input), definition: null };
  }
  const definition = await liveWorkerDefinition(prisma, original, providerId);
  const input = definition
    ? {
        ...frozenRunnerInput(original, definition),
        definitionFence: definition.beforeFence,
        definitionBeforeReserve: definition.beforeReserve,
      }
    : original;
  return { input: withPayment(input), definition };
}
