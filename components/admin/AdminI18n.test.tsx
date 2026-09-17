import { AdminAccountLookup } from "@/components/admin/AdminAccountLookup";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminOpsActions } from "@/components/admin/AdminOpsActions";
import { AdminProviderHealth } from "@/components/admin/AdminProviderHealth";
import {
  instanceAdminFeatureTestMessages,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { formatDisplayDateTimeWithSeconds } from "@/lib/dates/format";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { baseData } from "./admin-dashboard-test-fixtures";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  sendTest: vi.fn(),
  showToast: vi.fn(),
  sweep: vi.fn(),
}));

vi.mock("@/lib/actions/instance-admin-account", () => ({
  lookupInstanceAdminAccount: mocks.lookup,
}));
vi.mock("@/lib/actions/instance-admin", () => ({
  runOpsSweepNow: mocks.sweep,
  sendTestSlackNotification: mocks.sendTest,
}));
vi.mock("@/components/ui/toast-context", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
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

  it("renders a Polish lookup control and maps the stable rate-limit status without exposing server English", async () => {
    const user = userEvent.setup();
    mocks.lookup.mockResolvedValue({
      message: "Too many account lookups. Try again shortly.",
      retryAt: "2026-07-18T01:00:00.000Z",
      status: "rate_limited",
    });
    const messages = preparedMessages();

    renderWithFeatureMessages(<AdminAccountLookup />, {
      dateFormat: "day_first",
      locale: "pl",
      messages,
      timeZone: "Europe/Warsaw",
    });

    await user.type(screen.getByLabelText("Exact email or user ID"), "usr_limited");
    await user.click(screen.getByRole("button", { name: "Wyszukaj" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Za dużo wyszukiwań kont. Spróbuj ponownie za chwilę.",
    );
    expect(screen.queryByText("Too many account lookups. Try again shortly.")).toBeNull();
  });

  it("uses the actual action boundary and translated test-notification result copy", async () => {
    mocks.sendTest.mockResolvedValue({
      message: "untrusted delivery diagnostic",
      status: "delivery_failed",
    });
    const messages = preparedMessages();

    renderWithFeatureMessages(<AdminOpsActions slackConfigured />, {
      locale: "pl",
      messages,
      timeZone: "Europe/Warsaw",
    });

    fireEvent.click(screen.getByRole("button", { name: "Wyślij testowe powiadomienie" }));

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(
        "Testowe powiadomienie nie zostało dostarczone.",
        { severity: "error" },
      ),
    );
    expect(mocks.showToast).not.toHaveBeenCalledWith(
      "untrusted delivery diagnostic",
      expect.anything(),
    );
  });

  it("uses the injected locale and timezone for dashboard labels and timestamps while retaining USD", () => {
    const messages = preparedMessages();
    const context = { dateFormat: "day_first", locale: "pl", timeZone: "Europe/Warsaw" } as const;
    const dashboard = {
      ...baseData,
      ops: {
        ...baseData.ops,
        events: [
          {
            attempts: 1_234,
            createdAt: "2026-07-17T12:00:00.000Z",
            deliveredAt: null,
            kind: "example.com",
            severity: "warning" as const,
          },
        ],
      },
      worker: { ...baseData.worker, status: "unknown" as const },
    };

    renderWithFeatureMessages(<AdminDashboard data={dashboard} />, {
      dateFormat: context.dateFormat,
      locale: context.locale,
      messages,
      timeZone: context.timeZone,
    });

    expect(screen.getByRole("region", { name: "Pracownik" })).toHaveAttribute(
      "aria-labelledby",
      "admin-worker",
    );
    expect(screen.getByText("nieznany")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Statystyki instancji" })).toHaveAttribute(
      "id",
      "admin-instance-stats",
    );
    expect(
      screen.getAllByText(
        formatDisplayDateTimeWithSeconds(new Date(baseData.worker.lastSeenAt), context),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(new Intl.NumberFormat(context.locale).format(1_234)),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/USD/u).length).toBeGreaterThan(0);
    expect(screen.queryByText(/PLN/u)).toBeNull();
  });

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
