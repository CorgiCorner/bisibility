import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import {
  renderWithSharedMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import sharedMessages from "@/messages/core/en/shared.json";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyAnalyticsConsent: vi.fn(),
  readAppliedAnalyticsConsent: vi.fn(),
  readAnalyticsConsentScope: vi.fn(() => 0),
  setAnalyticsReplay: vi.fn(),
}));

vi.mock("@/lib/analytics/client", () => mocks);

const polishConsentMessages = {
  shared: {
    ...sharedMessages.shared,
    analyticsConsent: {
      ...sharedMessages.shared.analyticsConsent,
      actions: {
        acceptAll: "Zaakceptuj wszystkie",
        rejectAll: "Odrzuc wszystkie",
        save: "Zapisz",
        settings: "Ustawienia",
      },
      banner: {
        ...sharedMessages.shared.analyticsConsent.banner,
        ariaLabel: "Zgoda na analityke",
        body: "Liczymy wizyty bez plikow cookie.",
        saveError: "Nie mozna zapisac wyboru. Wylaczone opcje pozostaja wylaczone.",
        update: "Nagrania moga obejmowac ekrany aplikacji.",
      },
      modal: {
        ...sharedMessages.shared.analyticsConsent.modal,
        alwaysOn: "Zawsze wlaczone",
        essential: { body: "Wymagane dla bezpieczenstwa.", title: "Niezbedne" },
        footer: "Wybor jest zapisany przez 6 miesiecy.",
        intro: "Wybierz analityke i nagrania osobno.",
        privacyPolicy: "Polityka prywatnosci",
        replay: { body: "Opcjonalne nagrania pomagaja nam ulepszac aplikacje.", title: "Nagrania" },
        saveError: "Nie mozna zapisac zmian. Wylaczone opcje pozostaja wylaczone.",
        usage: { body: "Strony i kroki konfiguracji, ktorych uzywasz.", title: "Analityka uzycia" },
        visitCounts: "Nadal liczymy wizyty bez trwalego profilu.",
      },
      title: "Ustawienia prywatnosci",
    },
  },
};

describe("ConsentBanner", () => {
  beforeEach(() => {
    mocks.readAnalyticsConsentScope.mockReturnValue(0);
    // biome-ignore lint/suspicious/noDocumentCookie: Reset only the consent cookie in the test DOM.
    document.cookie = "bv_consent=; Max-Age=0; Path=/";
  });
  afterEach(() => vi.useRealTimers());

  it("delays the first prompt without saving or enabling analytics", async () => {
    vi.useFakeTimers();
    const saveConsent = vi.fn();
    render(<ConsentBanner saveConsent={saveConsent} />);
    expect(screen.queryByRole("region", { name: "Analytics consent" })).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByRole("region", { name: "Analytics consent" })).toHaveAttribute(
      "data-consent-variant",
      "delayed_5s",
    );
    expect(saveConsent).not.toHaveBeenCalled();
  });
  it("prompts immediately for expired account analytics despite a valid replay cookie", () => {
    // biome-ignore lint/suspicious/noDocumentCookie: Retain the independent replay decision in the fixture.
    document.cookie = "bv_consent=v2.a1.r1.t1788552000; Path=/";
    render(
      <ConsentBanner
        initialConsent={{
          analytics: false,
          analyticsNeedsDecision: true,
          replay: true,
          decidedAt: 1788552000,
          status: "decided",
        }}
        saveConsent={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "Analytics consent" })).toHaveAttribute(
      "data-consent-variant",
      "immediate",
    );
  });
  it("does not apply a completed choice after the account scope changed", async () => {
    let finish!: (value: import("@/lib/analytics/consent").ConsentState) => void;
    const saveConsent = vi.fn(
      () =>
        new Promise<import("@/lib/analytics/consent").ConsentState>((resolve) => {
          finish = resolve;
        }),
    );
    render(<ConsentBanner delayMs={0} saveConsent={saveConsent} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    mocks.applyAnalyticsConsent.mockClear();
    mocks.setAnalyticsReplay.mockClear();
    mocks.readAnalyticsConsentScope.mockReturnValue(1);
    await act(async () =>
      finish({ analytics: true, replay: true, decidedAt: 1788552000, status: "decided" }),
    );
    expect(mocks.applyAnalyticsConsent).not.toHaveBeenCalled();
    expect(mocks.setAnalyticsReplay).not.toHaveBeenCalled();
  });
  it("makes refusal a single click and applies the result immediately", async () => {
    const consent = {
      analytics: false,
      decidedAt: 1,
      replay: false,
      status: "decided" as const,
    };
    const saveConsent = vi.fn().mockResolvedValue(consent);
    render(<ConsentBanner delayMs={0} saveConsent={saveConsent} />);

    fireEvent.click(screen.getByRole("button", { name: "Reject all" }));

    await waitFor(() =>
      expect(saveConsent).toHaveBeenCalledWith(
        { analytics: false, replay: false },
        expect.objectContaining({ variant: "immediate", source: "banner" }),
      ),
    );
    expect(mocks.applyAnalyticsConsent).toHaveBeenCalledWith(consent);
    expect(mocks.setAnalyticsReplay).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(screen.queryByLabelText("Analytics consent")).not.toBeInTheDocument(),
    );
  });

  it("opens settings without granting consent", () => {
    const saveConsent = vi.fn();
    render(<ConsentBanner delayMs={0} saveConsent={saveConsent} />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Privacy choices" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Usage analytics/ })).toBeChecked();
    expect(saveConsent).not.toHaveBeenCalled();
  });

  it("keeps accept and refuse actions the same size", () => {
    render(<ConsentBanner delayMs={0} saveConsent={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Accept all" })).toHaveClass("w-full");
    expect(screen.getByRole("button", { name: "Reject all" })).toHaveClass("w-full");
  });

  it("renders translated consent actions and a translated safe-save error", async () => {
    const saveConsent = vi.fn().mockRejectedValue(new Error("offline"));
    renderWithFeatureMessages(<ConsentBanner delayMs={0} saveConsent={saveConsent} />, {
      locale: "pl",
      messages: polishConsentMessages,
    });

    expect(screen.getByLabelText("Zgoda na analityke")).toBeVisible();
    expect(screen.getByRole("button", { name: "Odrzuc wszystkie" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Zaakceptuj wszystkie" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reject all" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Odrzuc wszystkie" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nie mozna zapisac wyboru. Wylaczone opcje pozostaja wylaczone.",
    );
  });
});
