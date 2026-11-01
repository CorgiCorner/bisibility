import "server-only";
import type { AccountAdapter, AccountFact } from "@/lib/providers/account-health/adapter";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import type { ProviderCredentials } from "@/lib/providers/types";

export const PROBE_DEADLINE_MS = 15_000;
export const PROBE_LEASE_MS = 60_000;
const scope = { kind: "account" } as const;

export async function runAccountProbe(input: {
  adapter: AccountAdapter;
  credentials: ProviderCredentials;
  projectId: string;
  provider: string;
}): Promise<{ fact: AccountFact; retryAt?: Date; timedOut?: boolean }> {
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ fact: AccountFact; timedOut?: boolean }>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve({ fact: { kind: "failure", code: "provider_transient", scope }, timedOut: true });
    }, PROBE_DEADLINE_MS);
  });
  const work = (async () => {
    try {
      const gate = await consumeProviderLimit(input.provider, input.credentials, {
        projectId: input.projectId,
      });
      if (expired) return { fact: { kind: "not_verified", scope } as AccountFact };
      if (!gate.success)
        return {
          fact: { kind: "failure", code: "provider_rate_limited", scope } as AccountFact,
          retryAt: new Date(gate.resetAt),
        };
      const fact = await input.adapter.check?.(input.credentials, scope);
      return { fact: fact ?? ({ kind: "not_verified", scope } as AccountFact) };
    } catch {
      return { fact: { kind: "failure", code: "provider_transient", scope } as AccountFact };
    }
  })();
  const result = await Promise.race([work, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}
