import { sharedMessages as messages } from "@/i18n/core-messages";
import { policy } from "@/lib/local-monitor-recurring/recurring.test-fixture";
import type {
  previewRecurringMonitorAction,
  readRecurringMonitorAction,
} from "@/lib/local-monitor-recurring/session-actions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

export const recurringUiState: Awaited<ReturnType<typeof readRecurringMonitorAction>> = {
  enabled: true,
  mode: "manual",
  version: 1,
  approval: null,
  choicesTruncated: false,
  schedules: [
    { id: policy.scheduleId, name: "Owned calendar", epoch: "5", timezone: "Europe/Warsaw" },
  ],
  connections: [{ id: policy.connectionId, provider: "dataforseo" }],
};
type Preview = Extract<
  Awaited<ReturnType<typeof previewRecurringMonitorAction>>,
  { kind: "ready" }
>;
export function recurringUiPreview(overrides: Partial<Preview["command"]> = {}): Preview {
  const { actorId, internalProjectId, connectionStamp, definitionHash, ...command } = policy;
  return {
    kind: "ready",
    command: {
      ...command,
      maximumPerOccurrenceCents: "100",
      maximumTotalCents: "10000",
      maximumOccurrences: 2,
      consentToken: "test-only-original-consent",
      ...overrides,
    },
    expiresAt: "2026-10-12T12:02:00Z",
    nativeEstimates: policy.quote.nativeEstimates,
    expectedCount: 1,
  };
}
export function renderRecurring(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}
