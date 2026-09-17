import {
  accountFeatureTestMessages,
  featureMessagesElement,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { dateFromFrozenNow } from "@/tests/clock";
import { screen } from "@testing-library/react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionsSection } from "./SessionsSection";

vi.mock("./RevokeSessionButton", () => ({
  RevokeSessionButton: () => <button type="button">Odwołaj</button>,
}));
vi.mock("./SignOutEverywhereButton", () => ({
  SignOutEverywhereButton: () => <button type="button">Wyloguj</button>,
}));

const polishAccountMessages = {
  ...accountFeatureTestMessages,
  account: {
    ...accountFeatureTestMessages.account,
    security: {
      ...accountFeatureTestMessages.account.security,
      sessions: {
        ...accountFeatureTestMessages.account.security.sessions,
        activeDays: "aktywna {count, number}d temu",
        activeHours: "aktywna {count, number}h temu",
        activeJustNow: "aktywna teraz",
        activeMinutes: "aktywna {count, number}m temu",
        browserUnknown: "Przeglądarka",
        device: "{browser} / {operatingSystem}",
        locationUnknown: "Nieznana lokalizacja",
        operatingSystemUnknown: "Nieznany system",
        thisDevice: "To urządzenie",
      },
    },
  },
};

describe("SessionsSection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(dateFromFrozenNow());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats known and unknown session details with raw elapsed values", () => {
    renderWithFeatureMessages(
      <SessionsSection
        referenceTime={dateFromFrozenNow().toISOString()}
        revokeSession={vi.fn().mockResolvedValue({ revoked: true })}
        sessions={[
          {
            browser: null,
            current: true,
            id: "sid_current",
            ipAddress: null,
            lastActiveAt: dateFromFrozenNow(),
            operatingSystem: null,
          },
          {
            browser: "Chrome",
            current: false,
            id: "sid_one-minute",
            ipAddress: "127.0.0.1",
            lastActiveAt: dateFromFrozenNow({ minutes: -1 }),
            operatingSystem: "macOS",
          },
          {
            browser: "Safari",
            current: false,
            id: "sid_multiple-minutes",
            ipAddress: "192.0.2.10",
            lastActiveAt: dateFromFrozenNow({ minutes: -2 }),
            operatingSystem: "iOS",
          },
        ]}
        signOutEverywhere={vi.fn().mockResolvedValue({ revokedCount: 2 })}
      />,
      { locale: "pl", messages: polishAccountMessages },
    );

    expect(screen.getByText("Przeglądarka / Nieznany system")).toBeVisible();
    expect(screen.getByText("Nieznana lokalizacja · aktywna teraz")).toBeVisible();
    expect(screen.getByText("To urządzenie")).toBeVisible();
    expect(screen.getByText("Chrome / macOS")).toBeVisible();
    expect(screen.getByText("127.0.0.1 · aktywna 1m temu")).toBeVisible();
    expect(screen.getByText("Safari / iOS")).toBeVisible();
    expect(screen.getByText("192.0.2.10 · aktywna 2m temu")).toBeVisible();
  });

  it("keeps the serialized session reference stable across SSR hydration boundaries", async () => {
    const referenceTime = dateFromFrozenNow().toISOString();
    const props = {
      referenceTime,
      revokeSession: vi.fn().mockResolvedValue({ revoked: true }),
      sessions: [
        {
          browser: "Chrome" as const,
          current: false,
          id: "sid_minute-boundary",
          ipAddress: "192.0.2.11",
          lastActiveAt: dateFromFrozenNow({ seconds: -30 }),
          operatingSystem: "macOS" as const,
        },
        {
          browser: "Firefox" as const,
          current: false,
          id: "sid_hour-boundary",
          ipAddress: "192.0.2.12",
          lastActiveAt: dateFromFrozenNow({ minutes: -59, seconds: -30 }),
          operatingSystem: "Windows" as const,
        },
        {
          browser: "Safari" as const,
          current: false,
          id: "sid_day-boundary",
          ipAddress: "192.0.2.13",
          lastActiveAt: dateFromFrozenNow({ hours: -23, minutes: -30 }),
          operatingSystem: "iOS" as const,
        },
      ],
      signOutEverywhere: vi.fn().mockResolvedValue({ revokedCount: 3 }),
    };
    const serverTree = featureMessagesElement(<SessionsSection {...props} />, {
      messages: accountFeatureTestMessages,
    });
    const container = document.createElement("div");
    container.innerHTML = renderToString(serverTree);
    document.body.append(container);

    expect(container).toHaveTextContent("192.0.2.11 · active 1m ago");
    expect(container).toHaveTextContent("192.0.2.12 · active 1h ago");
    expect(container).toHaveTextContent("192.0.2.13 · active 1d ago");

    vi.setSystemTime(dateFromFrozenNow({ days: 3 }));
    const root = hydrateRoot(
      container,
      featureMessagesElement(<SessionsSection {...props} />, {
        messages: accountFeatureTestMessages,
      }),
    );

    await act(async () => undefined);

    expect(container).toHaveTextContent("192.0.2.11 · active 1m ago");
    expect(container).toHaveTextContent("192.0.2.12 · active 1h ago");
    expect(container).toHaveTextContent("192.0.2.13 · active 1d ago");

    await act(async () => root.unmount());
    container.remove();
  });
});
