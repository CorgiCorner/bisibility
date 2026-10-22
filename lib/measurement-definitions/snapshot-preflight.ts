import "server-only";
import { prisma } from "@/lib/db/prisma";
import { DefinitionUnavailableError } from "./errors";
import {
  assertSnapshotDefinitionSession,
  type SnapshotDefinitionSession,
} from "./snapshot-dispatch";

/** Continuations own a completed snapshot lease, rather than a running rank reservation. */
export async function assertSnapshotContinuationPreflight(
  session: SnapshotDefinitionSession,
  input: {
    projectId?: string;
    keywordId: string;
    rankCheckId?: string;
    connection: { id?: string; provider: string; credentialSource?: string };
  },
) {
  assertSnapshotDefinitionSession(session);
  const binding = session.binding;
  if (
    input.projectId !== binding.projectId ||
    input.keywordId !== binding.keywordId ||
    input.rankCheckId !== binding.rankCheckId ||
    input.connection.id !== binding.connectionId ||
    input.connection.provider !== "serpapi" ||
    input.connection.credentialSource !== (binding.credentialSource ?? "own")
  )
    throw new DefinitionUnavailableError();
  await prisma.$transaction(async (tx) => session.preflight(tx));
}
