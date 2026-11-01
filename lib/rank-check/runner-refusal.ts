import "server-only";
import { prisma } from "@/lib/db/prisma";
import { recordRankRefusals } from "@/lib/integrations/provider-recovery/refusal-journal";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import {
  ProviderRecoveryAdmissionError,
  ProviderUsagePersistenceError,
} from "@/lib/providers/usage";
import type { RunCheckInput } from "./runner-input";

export async function recordRunnerRefusal(
  error: unknown,
  input: RunCheckInput,
  provider: string,
  fenced: number,
) {
  if (!(error instanceof ProviderRecoveryAdmissionError)) return;
  if (!input.connection.id || !input.rankCheckId)
    throw new ProviderUsagePersistenceError({ cause: error, phase: "admission" });
  try {
    await recordRankRefusals(prisma, {
      connectionId: input.connection.id,
      credentialVersion: ownCredentialVersion(
        provider,
        input.connection.id,
        input.connection.credentialsEncrypted,
      ),
      checks: [{ rankCheckId: input.rankCheckId }],
      refusal: error,
    });
  } catch (cause) {
    throw new ProviderUsagePersistenceError({ cause, phase: "admission" });
  }
  if (fenced) throw new ProviderUsagePersistenceError({ cause: error, phase: "admission" });
}
