import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { storeProviderResponse } from "./store";

/** The connection id is assigned by server-side loading, never by a provider response. */
export function connectionResponseRecorder(
  connectionId: string,
  provider: string,
  feature = "analytics",
) {
  let project: Promise<{ projectId: string } | null> | undefined;
  return async (status: number, body: unknown, url?: string) => {
    try {
      project ??= prisma.providerConnection.findFirst({
        where: { id: connectionId, provider },
        select: { projectId: true },
      });
      const connection = await project;
      if (!connection) throw new Error("Response capture connection is unavailable.");
      await storeProviderResponse(
        { projectId: connection.projectId, connectionId, provider, feature },
        { status, body, url },
      );
    } catch (cause) {
      throw new ProviderUsagePersistenceError({ cause, phase: "settlement" });
    }
  };
}
