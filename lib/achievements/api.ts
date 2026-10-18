import "server-only";
import { achievementsEnabled } from "./config";
import { qualifiesPractice } from "./qualification";
import { recordQualifiedUse } from "./record-use";
import { isPracticeEstimate } from "./request";
export async function withPracticeRequest<T extends Response | null | undefined>(
  input: { actorId?: string | null; req: Request; url: URL },
  operation: string,
  run: () => T | Promise<T>,
): Promise<T> {
  if (
    !achievementsEnabled() ||
    !qualifiesPractice({ actorId: input.actorId, operation, success: true })
  )
    return run();
  const estimate = await isPracticeEstimate(input.req, input.url, operation);
  const response = await run();
  if (response?.ok)
    recordQualifiedUse({ actorId: input.actorId, operation, estimate, success: true });
  return response;
}
