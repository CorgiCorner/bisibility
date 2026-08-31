import { storyFirstView } from "@/components/search-insights/search-insights-story-fixtures";
import { ToastProvider } from "@/components/ui";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SearchInsightsBodySection } from "./SearchInsightsSections";

it("renders a failed GA4 callback card instead of the default Connect card", async () => {
  const section = await SearchInsightsBodySection({
    cancelAction: vi.fn(),
    completeAction: vi.fn(),
    disconnectAction: vi.fn(),
    ga4Oauth: {
      error: null,
      provider: "ga4",
      setup: {
        error:
          "Couldn't load your GA4 properties. This Google account may not have Analytics access, or Google rejected the request.",
        failureClass: "provider_4xx",
        properties: [],
        provider: "ga4",
      },
    },
    importState: null,
    loadRowsAction: vi.fn(),
    period: "28",
    projectId: "prj_1",
    property: "sc-domain:bisibility.com",
    returnPath: "/app/prj_1/search-console?property=sc-domain%3Abisibility.com&period=28",
    syncPlan: { daysTotal: 488, pace: "normal", retentionMonths: 16 },
    view: Promise.resolve(storyFirstView),
  });

  render(<ToastProvider>{section}</ToastProvider>);

  expect(screen.getByText("Couldn't load your GA4 properties.")).toBeInTheDocument();
  expect(
    screen.getByRole("textbox", { name: /Google Analytics 4 property id/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Connect" })).not.toBeInTheDocument();
  expect(screen.getByRole("table", { name: "Top queries" })).toBeInTheDocument();
  expect(screen.getByRole("table", { name: "Top pages" })).toBeInTheDocument();
});
