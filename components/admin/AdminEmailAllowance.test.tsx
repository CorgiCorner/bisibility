import {
  instanceAdminFeatureTestMessages,
  renderWithFeatureMessages as renderFeature,
} from "@/i18n/test-support/render-with-feature-messages";
import polish from "@/messages/core/pl/instance-admin.json";
import type { ReactElement } from "react";

function renderWithFeatureMessages(
  element: ReactElement,
  options: { locale?: "en" | "pl"; timeZone?: string } = {},
) {
  return renderFeature(element, {
    messages:
      options.locale === "pl"
        ? { ...instanceAdminFeatureTestMessages, ...polish }
        : instanceAdminFeatureTestMessages,
    ...options,
  });
}

import type { InstanceEmailAllowance } from "@/lib/email/allowance-model";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminEmailAllowance } from "./AdminEmailAllowance";

const available: InstanceEmailAllowance = {
  asOf: "2026-10-14T23:59:59.000Z",
  day: "2026-10-14T00:00:00.000Z",
  resetsAt: "2026-10-15T00:00:00.000Z",
  scope: "installation",
  status: "available",
  categories: [
    { category: "bulk", limit: 20, reservedAttempts: 4, remaining: 16 },
    { category: "transactional", limit: 7, reservedAttempts: 0, remaining: 7 },
  ],
};

describe("administrator email allowance", () => {
  it("shows reserved recipient attempts, actual UTC reset and help without claiming deliveries", () => {
    renderWithFeatureMessages(<AdminEmailAllowance allowance={available} />, {
      locale: "en",
      timeZone: "America/New_York",
    });
    const panel = screen.getByRole("region", { name: "Email sending today" });
    expect(within(panel).getAllByText("Reserved attempts")).toHaveLength(2);
    expect(within(panel).getByText("4")).toBeInTheDocument();
    expect(within(panel).getByText("16")).toBeInTheDocument();
    expect(within(panel).getByText("0")).toBeInTheDocument();
    expect(within(panel).getByText(/Resets .*15.*00:00 UTC/u)).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", {
        name: /Each reserved recipient send.*not delivered-message totals/u,
      }),
    ).toBeInTheDocument();
    expect(within(panel).queryByText("Delivered")).not.toBeInTheDocument();
  });

  it("shows local setup instead of active default allowances when mail is unconfigured", () => {
    renderWithFeatureMessages(
      <AdminEmailAllowance
        allowance={{ ...available, status: "not_configured", categories: [] }}
      />,
    );
    expect(
      screen.getByText("Email sending is not configured for this installation."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email setup" })).toHaveAttribute(
      "href",
      expect.stringContaining("/self-hosting/email"),
    );
    expect(screen.queryByText("Daily limit")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("does not turn unavailable attempt counts into zero or an unlimited allowance", () => {
    renderWithFeatureMessages(
      <AdminEmailAllowance
        allowance={{
          ...available,
          status: "unavailable",
          categories: available.categories.map((row) => ({
            ...row,
            reservedAttempts: null,
            remaining: null,
          })),
        }}
      />,
    );
    expect(screen.getByText(/Email attempt counts are unavailable/u)).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("Unlimited")).not.toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("separates unreadable configuration from absent configuration", () => {
    renderWithFeatureMessages(
      <AdminEmailAllowance allowance={{ ...available, status: "unavailable", categories: [] }} />,
    );
    expect(screen.getByText(/Email settings could not be read/u)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Email setup" })).not.toBeInTheDocument();
    expect(screen.queryByText("Daily limit")).not.toBeInTheDocument();
  });

  it("hides an inapplicable read-only demo allowance", () => {
    const { container } = renderWithFeatureMessages(
      <AdminEmailAllowance allowance={{ ...available, status: "disabled", categories: [] }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("uses the installed Polish email strings", () => {
    renderWithFeatureMessages(<AdminEmailAllowance allowance={available} />, { locale: "pl" });
    expect(screen.getByRole("region", { name: "Wysyłka e-maili dzisiaj" })).toBeInTheDocument();
    expect(screen.getAllByText("Zarezerwowane próby")).toHaveLength(2);
  });
});
