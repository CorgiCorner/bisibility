import { ToastProvider } from "@/components/ui";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchInsightsOauthReturn } from "./SearchInsightsOauthReturn";

const setup = {
  accountEmail: "owner@example.com",
  properties: [
    {
      kind: "domain" as const,
      label: "example.com",
      permissionLevel: "siteOwner",
      value: "sc-domain:example.com",
    },
  ],
  provider: "gsc" as const,
};

function renderReturn(disconnectAction = vi.fn().mockResolvedValue({ ok: true })) {
  render(
    <ToastProvider>
      <SearchInsightsOauthReturn
        cancelAction={vi.fn()}
        completeAction={vi.fn()}
        disconnectAction={disconnectAction}
        projectId="prj_1"
        setup={setup}
        syncPlan={{ daysTotal: 488, pace: "normal", retentionMonths: 16 }}
      />
    </ToastProvider>,
  );
  return disconnectAction;
}

describe("SearchInsightsOauthReturn", () => {
  it("renders the standalone property selection layout and keeps disconnect confirmed", async () => {
    const disconnectAction = renderReturn();

    const layout = screen.getByTestId("search-insights-oauth-return");
    expect(layout).toHaveClass("w-full", "max-w-[676px]");
    expect(screen.getByRole("heading", { name: "Pick the property to read" })).toBeVisible();
    const googleMark = screen.getByRole("img", { name: "Google logo" });
    expect(googleMark).toBeVisible();
    expect(googleMark).toHaveAttribute("data-module-mark", "soft");
    expect(googleMark).toHaveClass(
      "h-[54px]",
      "w-[54px]",
      "rounded-[13px]",
      "border",
      "border-accent/30",
      "bg-accent-soft",
      "text-accent-solid",
    );
    const googleLogo = googleMark.querySelector("svg");
    expect(googleLogo).toHaveAttribute("viewBox", "0 0 256 256");
    expect(googleLogo).toHaveAttribute("width", "25");
    expect(googleLogo).toHaveAttribute("data-icon-weight", "regular");
    expect(
      screen.getByText(
        "Search Console reports per property. Choose one, and bisibility imports its history - you can change it later without losing what has already been pulled.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Select a verified property")).toBeVisible();
    const propertyTrigger = screen.getByRole("button", { name: "Search Console property" });
    expect(propertyTrigger).toHaveClass("min-h-[42px]", "px-[11px]");
    expect(propertyTrigger).not.toHaveClass("min-h-[52px]", "px-4");
    expect(screen.getByText("Owner · Domain property")).toBeVisible();
    const importInfo = screen.getByText(
      "Importing 16 months takes about 1,900 requests to Google. First view in ~30 min; full history in ~2 days at Standard speed.",
    );
    expect(importInfo).toBeVisible();
    expect(screen.getByRole("button", { name: "Import depth" })).toHaveTextContent("16 months");
    expect(screen.getByRole("button", { name: "Import speed" })).toHaveTextContent("Standard");
    expect(screen.getByText(/Domain properties cover all subdomains/)).toBeInTheDocument();

    const primary = screen.getByRole("button", { name: "Use selected property" });
    expect(primary.parentElement).toHaveClass("justify-end");
    const disconnect = screen.getByRole("button", { name: "Disconnect" });
    const reconnectAccount = screen.getByRole("link", { name: "Reconnect account" });
    const footer = disconnect.closest('[data-slot="connected-google-account-footer"]');
    expect(footer).toHaveTextContent("owner@example.com");
    expect(footer).not.toHaveTextContent("Connected as");
    expect(footer).not.toHaveTextContent("Switch account");
    expect(footer).toHaveClass("border-t", "border-border");
    expect(footer).not.toHaveTextContent("·");
    expect(reconnectAccount).toHaveAttribute(
      "href",
      expect.stringContaining("/api/integrations/google/install"),
    );

    await userEvent.click(disconnect);
    const dialog = screen.getByRole("dialog", { name: "Disconnect Search Console" });
    expect(dialog).toHaveTextContent("removes the saved connection and authorization tokens");
    expect(dialog).toHaveTextContent("Already imported Search Console metrics remain available");
    expect(disconnectAction).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Disconnect Search Console" }),
    );
    await waitFor(() => expect(disconnectAction).toHaveBeenCalledWith({ projectId: "prj_1" }));
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("keeps the confirmation open and announces disconnect failures", async () => {
    renderReturn(vi.fn().mockRejectedValue(new Error("Authorization removal failed.")));
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    const dialog = screen.getByRole("dialog", { name: "Disconnect Search Console" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Disconnect Search Console" }),
    );

    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent("Authorization removal failed."),
    );
    expect(dialog).toBeInTheDocument();
  });

  it("submits selected GSC depth and speed from the shared property form", async () => {
    const completeAction = vi.fn().mockResolvedValue({ property: "sc-domain:example.com" });
    render(
      <ToastProvider>
        <SearchInsightsOauthReturn
          cancelAction={vi.fn()}
          completeAction={completeAction}
          disconnectAction={vi.fn()}
          projectId="prj_1"
          setup={setup}
          syncPlan={{ daysTotal: 488, pace: "normal", retentionMonths: 16 }}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Import depth" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "12 months" }));
    fireEvent.click(screen.getByRole("button", { name: "Import speed" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Reduced" }));
    await userEvent.click(screen.getByRole("button", { name: "Use selected property" }));

    expect(completeAction).toHaveBeenCalledWith({
      pace: "gentle",
      projectId: "prj_1",
      property: "sc-domain:example.com",
      retentionMonths: 12,
    });
  });

  /**
   * The confirm button used to return to idle the moment the action resolved, because
   * `router.refresh()` is fire-and-forget and `pending` was cleared in a `finally`. On the screen
   * that produced the report that reads as "nothing happened", and the second click submits again.
   */
  it("stays disabled after a successful confirm until the refreshed render arrives", async () => {
    const completeAction = vi.fn().mockResolvedValue({ property: "sc-domain:example.com" });
    render(
      <ToastProvider>
        <SearchInsightsOauthReturn
          cancelAction={vi.fn()}
          completeAction={completeAction}
          disconnectAction={vi.fn()}
          projectId="prj_1"
          setup={setup}
          syncPlan={{ daysTotal: 488, pace: "normal", retentionMonths: 16 }}
        />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Use selected property" }));

    expect(completeAction).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    const busy = await screen.findByRole("button", { name: "Connecting…" });
    expect(screen.queryByRole("button", { name: "Use selected property" })).not.toBeInTheDocument();

    // A second click on the same screen must not start a second connection. fireEvent bypasses the
    // pointer-events guard, so this asserts the handler itself is closed, not just the cursor.
    fireEvent.click(busy);
    expect(completeAction).toHaveBeenCalledTimes(1);
  });

  it("returns the confirm button to the customer when the action fails", async () => {
    const completeAction = vi.fn().mockRejectedValue(new Error("Property is not verified."));
    render(
      <ToastProvider>
        <SearchInsightsOauthReturn
          cancelAction={vi.fn()}
          completeAction={completeAction}
          disconnectAction={vi.fn()}
          projectId="prj_1"
          setup={setup}
          syncPlan={{ daysTotal: 488, pace: "normal", retentionMonths: 16 }}
        />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Use selected property" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Use selected property" })).toBeEnabled(),
    );
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("keeps successful GA4 discovery selectable inside its local card", async () => {
    render(
      <ToastProvider>
        <SearchInsightsOauthReturn
          cancelAction={vi.fn()}
          completeAction={vi.fn()}
          disconnectAction={vi.fn()}
          projectId="prj_1"
          setup={{
            properties: [
              {
                kind: "ga4",
                label: "Store (123456789)",
                permissionLevel: "Account",
                value: "123456789",
              },
            ],
            provider: "ga4",
          }}
        />
      </ToastProvider>,
    );

    expect(screen.getByRole("button", { name: "Google Analytics property" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use selected property" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("keeps GA4 discovery failure actionable with manual entry and a safe retry", async () => {
    const completeAction = vi.fn().mockResolvedValue({ property: "123456789" });
    const cancelAction = vi.fn();
    const disconnectAction = vi.fn();
    render(
      <ToastProvider>
        <SearchInsightsOauthReturn
          cancelAction={cancelAction}
          completeAction={completeAction}
          disconnectAction={disconnectAction}
          projectId="prj_1"
          setup={{
            error:
              "Couldn't load your GA4 properties. Google Analytics is temporarily unavailable.",
            failureClass: "provider_5xx",
            properties: [],
            provider: "ga4",
          }}
        />
      </ToastProvider>,
    );

    expect(screen.getByText("Select a Google Analytics 4 property")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load your GA4 properties.")).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: /Google Analytics 4 property id/i });
    await userEvent.type(input, "123456789");
    await userEvent.click(screen.getByRole("button", { name: "Use entered property" }));
    expect(completeAction).toHaveBeenCalledWith({ projectId: "prj_1", property: "123456789" });

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(routerMock.refresh).toHaveBeenCalled();
    expect(cancelAction).not.toHaveBeenCalled();
    expect(disconnectAction).not.toHaveBeenCalled();
  });
});
