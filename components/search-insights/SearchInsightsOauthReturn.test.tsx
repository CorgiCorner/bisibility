import { ToastProvider } from "@/components/ui/Toast";
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
      "Importing 16 months takes about 1,900 requests to Google. First view in ~5 min; full history in ~2 days at Standard speed.",
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
    expect(footer).toBeInstanceOf(HTMLElement);
    if (!(footer instanceof HTMLElement)) return;
    expect(footer).toHaveTextContent("owner@example.com");
    expect(footer).not.toHaveTextContent("Connected as");
    expect(footer).not.toHaveTextContent("Switch account");
    expect(footer).toHaveClass("border-t", "border-border");
    expect(footer).not.toHaveClass("bg-bg-sunken");
    expect(footer.parentElement).toHaveClass("overflow-hidden", "rounded-control");
    expect(footer.parentElement).not.toHaveClass("p-3.5");
    expect(footer.previousElementSibling).toHaveClass("p-3.5");
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

    const layout = screen.getByTestId("search-insights-oauth-return");
    expect(layout).toHaveClass("w-full");
    expect(layout).not.toHaveClass("max-w-[340px]");
    expect(screen.getByRole("heading", { name: "Connect Google Analytics 4" })).toBeVisible();
    const promise = screen.getByText(
      "See which queries and landing pages bring engaged visitors, and which convert. Read-only.",
    );
    expect(promise).toHaveClass("text-ui-caption");
    const trigger = screen.getByRole("button", { name: "Google Analytics property" });
    expect(trigger).toHaveAttribute("aria-describedby", promise.id);
    expect(screen.queryByText("Property ID 123456789")).not.toBeInTheDocument();
    expect(screen.queryByText("GA4")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
    const manual = screen.getByRole("button", { name: "Enter a property ID manually" });
    expect(manual).toHaveClass(
      "min-h-6",
      "text-[11.5px]",
      "text-fg",
      "hover:underline",
      "-ms-2",
      "px-2",
    );
    expect(manual).not.toHaveClass("underline", "text-fg-muted");
    const confirm = screen.getByRole("button", { name: "Use this property" });
    expect(confirm).toBeEnabled();
    expect(confirm).toHaveAttribute("data-variant", "secondary");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    const footer = screen.getByRole("button", { name: "Not now" }).parentElement;
    expect(footer).toHaveClass("justify-end", "border-t", "border-border", "px-4");
  });

  it("abandons an unfinished GA4 selection as Not now instead of disconnecting", async () => {
    const cancelAction = vi.fn();
    const disconnectAction = vi.fn();
    render(
      <ToastProvider>
        <SearchInsightsOauthReturn
          cancelAction={cancelAction}
          completeAction={vi.fn()}
          disconnectAction={disconnectAction}
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

    await userEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(cancelAction).toHaveBeenCalledWith({ projectId: "prj_1" });
    expect(disconnectAction).not.toHaveBeenCalled();
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

    expect(screen.getByRole("heading", { name: "Connect Google Analytics 4" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
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
