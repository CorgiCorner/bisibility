import "server-only";

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { Prisma, type Signal } from "@/lib/generated/prisma/client";
import type { SignalInput } from "./types";

export type PrismaClientLike = Pick<Prisma.TransactionClient, "signal">;

export async function emitSignal(
  input: SignalInput,
  client: PrismaClientLike = prisma,
): Promise<Signal> {
  return client.signal.create({
    data: {
      createdById: input.createdById,
      happenedAt: input.happenedAt,
      keywordId: input.keywordId,
      payload: input.payload === undefined ? undefined : (input.payload ?? Prisma.JsonNull),
      projectId: input.projectId,
      publicId: makePublicId("sig"),
      severity: input.severity,
      source: input.source,
      type: input.type,
      url: input.url,
    },
  });
}

export async function emitSignalSafe(
  input: SignalInput,
  client: PrismaClientLike = prisma,
): Promise<Signal | undefined> {
  try {
    return await emitSignal(input, client);
  } catch (error) {
    console.error("[signals] emit failed", { error, projectId: input.projectId, type: input.type });
    return undefined;
  }
}
