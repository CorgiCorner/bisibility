import {
  storyFirstView,
  storySignals,
} from "@/components/search-insights/search-insights-story-fixtures";
import { ToastProvider } from "@/components/ui/Toast";
import type { SearchInsightsSignals } from "@/lib/search-insights/queries/signals";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SearchInsightsBodySection } from "./SearchInsightsSections";

function sectionProps(signals: Promise<SearchInsightsSignals>) {
  return {
    cancelAction: vi.fn(),
    completeAction: vi.fn(),
    disconnectAction: vi.fn(),
    importState: null,
    loadRowsAction: vi.fn(),
    period: "28",
    projectId: "prj_1",
    property: "sc-domain:example.com",
    returnPath: "/app/prj_1/search-console?property=sc-domain%3Aexample.com&period=28",
    signals,
    view: Promise.resolve(storyFirstView),
  };
}

async function initialStreamHtml(node: ReactNode) {
  const stream = await renderToReadableStream(node);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";
  while (!html.includes('aria-label="Top pages"')) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_000)),
    ]);
    if (!chunk || chunk.done) break;
    html += decoder.decode(chunk.value, { stream: true });
  }
  return html;
}

async function settledStreamHtml(node: ReactNode) {
  const stream = await renderToReadableStream(node);
  await stream.allReady;
  return new Response(stream).text();
}

it("renders the tables while the signals read never settles", async () => {
  const section = await SearchInsightsBodySection(sectionProps(new Promise(() => undefined)));

  const html = await initialStreamHtml(<ToastProvider>{section}</ToastProvider>);
  const page = new DOMParser().parseFromString(html, "text/html");
  const chips = [...page.querySelectorAll('button[aria-busy="true"]')];

  expect(html).toContain('aria-label="Top queries"');
  expect(html).toContain('aria-label="Top pages"');
  expect(page.body.textContent).toContain("queries at positions 4-20");
  expect(page.body.textContent).toContain(
    "Already earning impressions, none of them in the top three",
  );
  expect(page.body.textContent).toContain("queries with page overlap");
  expect(page.body.textContent).toContain("2 or more of your pages ranking for the same query");
  expect(chips).toHaveLength(2);
  for (const chip of chips) {
    const number = chip.querySelector("[data-signal-number]");
    expect(number?.className).toContain("w-[7ch]");
    expect(number?.textContent).toBe("");
    expect(number?.querySelector(".animate-pulse")).not.toBeNull();
  }
});

it("renders the tables and an honest chip state when the signals read rejects", async () => {
  const signals = Promise.reject(new Error("signals unavailable"));
  void signals.catch(() => undefined);
  const section = await SearchInsightsBodySection(sectionProps(signals));

  const html = await settledStreamHtml(<ToastProvider>{section}</ToastProvider>);
  const page = new DOMParser().parseFromString(html, "text/html");
  const chips = [...page.querySelectorAll("button")].filter((button) =>
    button.textContent?.includes("Could not count"),
  );

  expect(page.querySelector('[role="table"][aria-label="Top queries"]')).not.toBeNull();
  expect(page.querySelector('[role="table"][aria-label="Top pages"]')).not.toBeNull();
  expect(chips).toHaveLength(2);
  for (const chip of chips) {
    expect(chip.textContent).not.toMatch(/\b0\b/);
  }
});

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
    signals: Promise.resolve(storySignals),
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
