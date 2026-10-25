import { renderWithShellMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { AppRealtimeContext, type AppRealtimeStatus } from "@/lib/realtime/useAppRealtime";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RealtimeIndicator } from "./RealtimeIndicator";

function indicator(status: AppRealtimeStatus) {
  return (
    <AppRealtimeContext.Provider value={{ notifications: null, operations: [], status }}>
      <RealtimeIndicator />
    </AppRealtimeContext.Provider>
  );
}
describe("RealtimeIndicator", () => {
  it.each(["live", "live-polling"] as const)(
    "renders delivering %s with visible text",
    (status) => {
      render(indicator(status));
      expect(screen.getByText("Live")).toBeVisible();
    },
  );
  it.each(["reconnecting", "offline"] as const)(
    "renders unavailable %s with visible text",
    (status) => {
      render(indicator(status));
      expect(screen.getByText("Reconnecting")).toBeVisible();
    },
  );
  it("does not announce initial connection, announces outage and recovery once", () => {
    const view = render(indicator("connecting"));
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("");
    view.rerender(indicator("live"));
    expect(region).toBeEmptyDOMElement();
    view.rerender(indicator("reconnecting"));
    expect(region).toHaveTextContent("Reconnecting");
    const first = region.firstChild;
    view.rerender(indicator("offline"));
    expect(region.firstChild).toBe(first);
    view.rerender(indicator("live-polling"));
    expect(region).toHaveTextContent("Live");
    const recovered = region.firstChild;
    view.rerender(indicator("live"));
    expect(region.firstChild).toBe(recovered);
    expect(region).toHaveAttribute("aria-live", "polite");
  });
});
