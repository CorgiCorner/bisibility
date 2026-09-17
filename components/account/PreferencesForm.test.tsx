import type { ActiveLocale } from "@/i18n/config";
import { coreMessages } from "@/i18n/core-messages";
import type { UserPreferences } from "@/lib/account/preferences-shared";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreferencesForm } from "./PreferencesForm";

const defaults = {
  dateFormat: "day_first",
  density: "standard",
  landing: "dashboard",
  theme: "system",
} satisfies UserPreferences;

describe("PreferencesForm", () => {
  beforeEach(() => {
    routerMock.refresh.mockClear();
  });

  function renderForm(
    updatePreferences = vi.fn(),
    updateUiLocale = vi.fn(),
    messages = coreMessages,
    options: { locale?: ActiveLocale } = {},
  ) {
    const locale = options.locale ?? "en";
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <PreferencesForm
          autoExample="day_first"
          defaults={defaults}
          locale={locale}
          todayKey="2026-08-24"
          updatePreferences={updatePreferences}
          updateUiLocale={updateUiLocale}
        />
      </NextIntlClientProvider>,
    );
  }

  it("shows the language control without a timezone preference", () => {
    renderForm();

    expect(screen.queryByText("Timezone")).not.toBeInTheDocument();
    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Language" })).toHaveTextContent("English");
    expect(screen.getByText("Date format")).toBeInTheDocument();
    expect(screen.getByText("Default landing page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Date format" })).toHaveTextContent("24 Aug 2026");
  });

  it("offers every activated locale under its own autonym", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Language" }));

    expect(screen.getAllByRole("menuitem").map((option) => option.textContent)).toEqual([
      "English",
      "Español (España)",
      "日本語",
      "Polski",
    ]);
  });

  it("saves exactly the four visible preference fields", async () => {
    const updatePreferences = vi.fn().mockImplementation(async (input) => input);
    renderForm(updatePreferences);

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({ ...defaults, theme: "dark" }),
    );
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the preference form pending until the deferred save settles", async () => {
    let settleSave: ((value: UserPreferences) => void) | undefined;
    const updatePreferences = vi.fn(
      () =>
        new Promise<UserPreferences>((resolve) => {
          settleSave = resolve;
        }),
    );
    renderForm(updatePreferences);

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() => expect(updatePreferences).toHaveBeenCalledOnce());
    expect(document.querySelector("#account-preferences-form")).toHaveAttribute(
      "aria-busy",
      "true",
    );

    settleSave?.({ ...defaults, theme: "dark" });

    await waitFor(() =>
      expect(document.querySelector("#account-preferences-form")).toHaveAttribute(
        "aria-busy",
        "false",
      ),
    );
  });

  it("keeps a non-English locale save pending, ignores a repeated selection, and refreshes once", async () => {
    let settleLocale: ((value: "pl") => void) | undefined;
    const updateUiLocale = vi.fn(
      () =>
        new Promise<"pl">((resolve) => {
          settleLocale = resolve;
        }),
    );
    renderForm(vi.fn(), updateUiLocale, coreMessages, { locale: "pl" });

    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Polski" }));

    await waitFor(() => expect(updateUiLocale).toHaveBeenCalledWith("pl"));
    expect(screen.getByRole("button", { name: "Date format" })).toHaveTextContent("sie");
    expect(document.querySelector("#account-preferences-form")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("button", { name: "Language" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    expect(updateUiLocale).toHaveBeenCalledOnce();

    settleLocale?.("pl");

    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(document.querySelector("#account-preferences-form")).toHaveAttribute(
        "aria-busy",
        "false",
      ),
    );
  });

  it("uses the scoped localized save failure instead of a server error message", async () => {
    const localizedMessages = structuredClone(coreMessages);
    (localizedMessages.account.preferences as unknown as { saveError: string }).saveError =
      "Nie udało się zapisać preferencji.";
    const updateUiLocale = vi.fn().mockRejectedValue(new Error("internal locale failure"));
    renderForm(vi.fn(), updateUiLocale, localizedMessages);

    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "English" }));

    expect(await screen.findByText("Nie udało się zapisać preferencji.")).toBeVisible();
    expect(screen.queryByText("internal locale failure")).not.toBeInTheDocument();
  });

  it("keeps shared stale-deployment recovery for the locale action", async () => {
    const updateUiLocale = vi
      .fn()
      .mockRejectedValue(new Error("Failed to find Server Action for this request"));
    renderForm(vi.fn(), updateUiLocale);

    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "English" }));

    expect(
      await screen.findByText(
        "bisibility was updated while this page was open. Refresh the app to continue. Any unsaved changes will be lost.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps a server digest reference for the locale action without leaking its detail", async () => {
    const updateUiLocale = vi.fn().mockRejectedValue(
      Object.assign(new Error("Server Components render failed: internal locale diagnostic"), {
        digest: "locale-42",
      }),
    );
    renderForm(vi.fn(), updateUiLocale);

    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "English" }));

    expect(
      await screen.findByText("Check failed on our side (ref locale-42). Retry in a moment."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/internal locale diagnostic/)).not.toBeInTheDocument();
  });
});
