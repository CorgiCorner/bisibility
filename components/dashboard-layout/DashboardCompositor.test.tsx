import { composeDashboardLayout } from "@/lib/dashboard-layout/compose";
import { presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import { dashboardFixtureTranslate, organicAccess } from "@/lib/dashboard-layout/test-fixtures";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { DashboardCompositor } from "./DashboardCompositor";

const shell = {
  scope: <span>Shared filter scope</span>,
  mode: <span>Read-only mode</span>,
  health: <span>Retained observation; latest attempt failed</span>,
  budget: <span>Budget status unknown</span>,
  coverage: <span>Observed 1 of 2; fresh unknown</span>,
};

describe("dashboard compositor", () => {
  it("shows one actionable scope empty state with short help instead of repeating unavailable widgets", async () => {
    render(
      <NextIntlClientProvider
        locale="en"
        timeZone="UTC"
        messages={{ shared: { measurementHelp: { close: "Close" } } }}
      >
        <DashboardCompositor
          composition={composeDashboardLayout(presetDashboardLayout("local"), organicAccess)}
          translate={dashboardFixtureTranslate}
          shell={shell}
          widgets={{ organic_kpis: { state: "ready", content: <p>Wrong scope metrics</p> } }}
          emptyState={<section>Choose a business location to continue</section>}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Choose a business location to continue")).toBeInTheDocument();
    expect(screen.queryByText("Wrong scope metrics")).toBeNull();
    expect(document.querySelectorAll("[data-dashboard-widget]")).toHaveLength(0);
    expect(document.querySelectorAll("[data-dashboard-shell]")).toHaveLength(1);
    expect(screen.getByText("Shared filter scope")).toBeVisible();
    expect(screen.getByRole("button", { name: "About this view" })).toBeVisible();
    expect(screen.queryByText("Budget status unknown")).toBeNull();
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("button", { name: "About this view" })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "This view shows saved results. It does not run checks.",
    );
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });
  it("keeps scope, mode, health, budget and coverage when every detailed widget is hidden", () => {
    const layout = presetDashboardLayout();
    const hidden = {
      ...layout,
      widgets: layout.widgets.map((widget) => ({ ...widget, visible: false })),
    };
    render(
      <DashboardCompositor
        composition={composeDashboardLayout(hidden, organicAccess)}
        translate={dashboardFixtureTranslate}
        shell={shell}
        widgets={{}}
      />,
    );
    expect(document.querySelectorAll("[data-dashboard-shell]")).toHaveLength(5);
    expect(document.querySelectorAll("[data-dashboard-widget]")).toHaveLength(0);
    expect(screen.getByText("Budget status unknown")).toBeInTheDocument();
    expect(screen.getByText("Observed 1 of 2; fresh unknown")).toBeInTheDocument();
  });

  it("a failed section preserves the other section and never fabricates numeric zero", () => {
    render(
      <DashboardCompositor
        composition={composeDashboardLayout(presetDashboardLayout(), organicAccess)}
        translate={dashboardFixtureTranslate}
        shell={shell}
        widgets={{
          organic_kpis: { state: "ready", content: <p>Organic report retained</p> },
          position_trend: { state: "error" },
        }}
      />,
    );
    expect(screen.getByText("Organic report retained")).toBeInTheDocument();
    expect(
      screen.getByText("This section could not be read. Other sections remain available."),
    ).toBeInTheDocument();
    expect(screen.getByText("Budget status unknown")).toBeInTheDocument();
  });

  it("does not render supplied data when project access is unavailable", () => {
    render(
      <DashboardCompositor
        composition={composeDashboardLayout(presetDashboardLayout(), {
          ...organicAccess,
          projectReadAuthorized: false,
        })}
        translate={dashboardFixtureTranslate}
        shell={shell}
        widgets={{
          organic_kpis: { state: "ready", content: <p>Synthetic forbidden report</p> },
        }}
      />,
    );
    expect(screen.queryByText("Synthetic forbidden report")).toBeNull();
    expect(screen.queryByText("Shared filter scope")).toBeNull();
    expect(screen.getAllByText("Context is unavailable. This does not mean zero.")).toHaveLength(5);
  });

  it("retains a visible unsupported widget reason while suppressing supplied unavailable-capability data", () => {
    const layout = presetDashboardLayout();
    const visible = {
      ...layout,
      widgets: layout.widgets.map((widget) =>
        widget.id === "contributors" ? { ...widget, visible: true } : widget,
      ),
    };
    render(
      <DashboardCompositor
        composition={composeDashboardLayout(visible, organicAccess)}
        translate={dashboardFixtureTranslate}
        shell={shell}
        widgets={{
          contributors: { state: "ready", content: <p>Synthetic unavailable-capability report</p> },
        }}
      />,
    );
    expect(screen.queryByText("Synthetic unavailable-capability report")).toBeNull();
    expect(
      screen.getByText("The stored data capability required by this section is unavailable."),
    ).toBeInTheDocument();
    expect(screen.getByText("Budget status unknown")).toBeInTheDocument();
  });
});
