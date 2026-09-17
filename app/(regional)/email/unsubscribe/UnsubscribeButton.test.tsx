import {
  emailPreferencesFeatureTestMessages,
  renderWithEmailPreferencesMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnsubscribeButton } from "./UnsubscribeButton";

const fetchMock = vi.fn();

describe("UnsubscribeButton", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("posts only the supplied token and replaces the page on success", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    render(<UnsubscribeButton token="unsubscribe_example_token" />);

    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/email/unsubscribe", {
        body: JSON.stringify({ token: "unsubscribe_example_token" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/email/unsubscribe?status=success"),
    );
  });

  it("shows a localized safe recovery message without exposing a network diagnostic", async () => {
    fetchMock.mockRejectedValue(new Error("unsubscribe transport rejected"));
    render(<UnsubscribeButton token="unsubscribe_example_token" />);

    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));

    expect(
      await screen.findByText("We could not update your preference. Please try again."),
    ).toBeVisible();
    expect(screen.queryByText("unsubscribe transport rejected")).not.toBeInTheDocument();
  });

  it("uses an injected non-English button payload without activating that locale", () => {
    const messages = structuredClone(emailPreferencesFeatureTestMessages);
    messages.emailPreferences.button = {
      error: "Nie mozemy zapisac preferencji.",
      idle: "Wypisz",
      pending: "Zapisywanie",
    };

    renderWithFeatureMessages(<UnsubscribeButton token="unsubscribe_example_token" />, {
      locale: "pl",
      messages,
    });

    expect(screen.getByRole("button", { name: "Wypisz" })).toBeVisible();
  });
});
