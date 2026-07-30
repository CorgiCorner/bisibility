import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  deploySignalPayload,
  httpSignalUrl,
  parseDeployEvent,
  shouldIgnoreDeployEvent,
} from "@/lib/ingest/deploy";
import {
  claimDeployReplay,
  completeDeployReplay,
  releaseDeployReplay,
} from "@/lib/ingest/deploy-replay";
import { markDeployIngestHookUsed } from "@/lib/queries/ingest-deploy";
import { emitSignal } from "@/lib/signals/emit";
import { SIGNAL_TYPES } from "@/lib/signals/types";

type IngestDeployEventInput = {
  actorId: string | null;
  body: unknown;
  hookId: string;
  projectId: string;
  provider: string | null;
  test?: boolean;
};

export type IngestDeployEventResult =
  | { status: "duplicate" }
  | { status: "ignored" }
  | { status: "unparseable" }
  | {
      payload: ReturnType<typeof deploySignalPayload> & { test?: true };
      signal: { id: string; publicId: string };
      status: "created";
    };

export async function ingestDeployEvent(
  input: IngestDeployEventInput,
): Promise<IngestDeployEventResult> {
  const event = parseDeployEvent(input.body, input.provider);
  if (!event) {
    if (!shouldIgnoreDeployEvent(input.body, input.provider)) {
      return { status: "unparseable" };
    }
    await markDeployIngestHookUsed(input.hookId);
    return { status: "ignored" };
  }

  const payload = {
    ...deploySignalPayload(event),
    ...(input.test ? { test: true as const } : {}),
  };
  const replay = await claimDeployReplay(input.hookId, event.deploymentId);
  if (replay.status === "duplicate") {
    await markDeployIngestHookUsed(input.hookId);
    return { status: "duplicate" };
  }

  let signal: Awaited<ReturnType<typeof emitSignal>>;
  try {
    signal = await emitSignal({
      createdById: input.actorId,
      payload: payload as Prisma.InputJsonValue,
      projectId: input.projectId,
      source: "deploy",
      type: SIGNAL_TYPES.deployCompleted,
      url: httpSignalUrl(event.url),
    });
  } catch (error) {
    await releaseDeployReplay(replay);
    throw error;
  }
  await completeDeployReplay(replay);

  await writeAudit({
    action: "signal.ingested",
    actorId: input.actorId,
    after: { id: signal.publicId, payload, source: "deploy", type: SIGNAL_TYPES.deployCompleted },
    projectId: input.projectId,
    targetId: signal.publicId,
    targetType: "signal",
  });
  await markDeployIngestHookUsed(input.hookId);

  return {
    payload,
    signal: { id: signal.id, publicId: signal.publicId },
    status: "created",
  };
}
