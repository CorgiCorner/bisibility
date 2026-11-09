import { AdminProviderHealth } from "@/components/admin/AdminProviderHealth";
import {
  instanceAdminFeatureTestMessages,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const _mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  sendTest: vi.fn(),
  showToast: vi.fn(),
  sweep: vi.fn(),
}));

function preparedMessages() {
  const messages = structuredClone(instanceAdminFeatureTestMessages);
  messages.instanceAdmin.account.lookup.rateLimited =
    "Za dużo wyszukiwań kont. Spróbuj ponownie za chwilę.";
  messages.instanceAdmin.controls.lookUp = "Wyszukaj";
  messages.instanceAdmin.controls.sendTestNotification = "Wyślij testowe powiadomienie";
  messages.instanceAdmin.dashboard.stats.title = "Statystyki instancji";
  messages.instanceAdmin.opsActions.deliveryFailed =
    "Testowe powiadomienie nie zostało dostarczone.";
  messages.instanceAdmin.providerHealth.failureRate = "{value, number, ::.0}% błędów";
  messages.instanceAdmin.providerHealth.failureRateUnknown = "brak danych";
  messages.instanceAdmin.status.unknown = "nieznany";
  messages.instanceAdmin.worker.title = "Pracownik";
  return messages;
}

describe("instance admin i18n boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps zero distinct from unavailable provider failure rates in a prepared locale", () => {
    const messages = preparedMessages();

    renderWithFeatureMessages(
      <AdminProviderHealth
        rows={[
          {
            failed: 0,
            failureRatePercent: 0,
            notRun: 0,
            ok: 3,
            p95AgeMs: 0,
            provider: "example.com",
            stale: 0,
          },
          {
            failed: 0,
            failureRatePercent: null,
            notRun: 1,
            ok: 0,
            p95AgeMs: null,
            provider: "example.org",
            stale: 0,
          },
        ]}
      />,
      { locale: "pl", messages, timeZone: "Europe/Warsaw" },
    );

    expect(screen.getByText(/0[,.]0% błędów/u)).toBeInTheDocument();
    expect(screen.getByText("brak danych")).toBeInTheDocument();
  });
});
