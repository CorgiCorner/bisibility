import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { ProviderUsageObserver } from "@/lib/providers/usage";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { type NativeResponse, type ResponseCaptureScope, storeProviderResponse } from "./store";

/** Archive only after accounting settles, so an archive failure cannot lose the charge. */
export function captureResponseObserver(
  base: ProviderUsageObserver,
  scope: ResponseCaptureScope,
  db?: Pick<PrismaClient, "providerResponseCapture">,
): ProviderUsageObserver {
  const pending = new Map<string, NativeResponse>();
  return {
    ...base,
    async observeResponse(status, body, attemptId) {
      if (attemptId) pending.set(attemptId, { status, body, attemptId });
      await base.observeResponse?.(status, body, attemptId);
    },
    async settle(id, receipt) {
      let failure: unknown;
      try {
        await base.settle(id, receipt);
      } catch (error) {
        failure = error;
      }
      const response = pending.get(id);
      if (!response) {
        if (failure) throw failure;
        return;
      }
      try {
        await storeProviderResponse(scope, response, db);
        pending.delete(id);
      } catch (cause) {
        if (failure) throw failure;
        throw new ProviderUsagePersistenceError({ cause, phase: "settlement", attemptId: id });
      }
      if (failure) throw failure;
    },
    async cancel(id) {
      pending.delete(id);
      await base.cancel?.(id);
    },
  };
}
