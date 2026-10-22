import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import {
  renderWithFeatureMessages,
  researchFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentResearchSearches } from "./RecentResearchSearches";

const render = (ui: ReactElement) =>
  renderWithFeatureMessages(ui, { messages: researchFeatureTestMessages });

const search = {
  cachedUntil: "2026-07-22T20:00:00.000Z",
  connectionId: "conn_a00000000000000000000000",
  createdAt: "2026-07-22T08:00:00.000Z",
  includeClickstream: false,
  scopeLabel: "United States / English",
  mode: "auto" as const,
  resultLimit: 100 as const,
  seed: "rank tracker",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("RecentResearchSearches", () => {
  it("disables replays and explains the missing provider", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T10:00:00.000Z"));
    const onOpen = vi.fn();
    const onRemove = vi.fn();

    render(
      <RecentResearchSearches
        disabled
        disabledHint="Connect DataForSEO to replay recent searches."
        onOpen={onOpen}
        onRemove={onRemove}
        searches={[search]}
      />,
    );

    const chip = screen.getByRole("button", { name: /^rank tracker/i });
    expect(chip).toBeDisabled();
    expect(screen.getByText("Connect DataForSEO to replay recent searches.")).toBeInTheDocument();
    fireEvent.click(chip);
    expect(onOpen).not.toHaveBeenCalled();

    const remove = screen.getByRole("button", {
      name: "Remove rank tracker from recent searches",
    });
    expect(remove).not.toBeDisabled();
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledWith(search);
  });

  it("removes a chip without replaying it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T10:00:00.000Z"));
    const onOpen = vi.fn();
    const onRemove = vi.fn();

    render(<RecentResearchSearches onOpen={onOpen} onRemove={onRemove} searches={[search]} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove rank tracker from recent searches" }),
    );

    expect(onRemove).toHaveBeenCalledWith(search);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("keeps the remove control visible", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T10:00:00.000Z"));

    render(<RecentResearchSearches onOpen={vi.fn()} onRemove={vi.fn()} searches={[search]} />);

    const remove = screen.getByRole("button", {
      name: "Remove rank tracker from recent searches",
    });
    expect(remove).not.toHaveClass("opacity-0");
    expect(remove).not.toHaveClass("group-hover:opacity-100");
  });

  it.each([
    ["2026-07-22T20:00:00.000Z", "cached, free for 10 hours"],
    ["2026-07-22T16:00:00.000Z", "cached, free for 6 hours"],
  ])("derives the remaining cache TTL from %s", (cachedUntil, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T10:00:00.000Z"));

    render(
      <RecentResearchSearches
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        searches={[{ ...search, cachedUntil }]}
      />,
    );

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("uses the shared relative-time labels", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T16:00:00.000Z"));

    render(
      <RecentResearchSearches
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        searches={[
          {
            cachedUntil: "2026-07-24T00:00:00.000Z",
            createdAt: "2026-07-22T10:00:00.000Z",
            includeClickstream: false,
            scopeLabel: "United States / English",
            mode: "auto",
            resultLimit: 100,
            seed: "rank tracker",
          },
          {
            cachedUntil: "2026-07-24T00:00:00.000Z",
            createdAt: "2026-07-23T16:00:00.000Z",
            includeClickstream: false,
            scopeLabel: "Germany / German",
            mode: "ideas",
            resultLimit: 100,
            seed: "seo tool",
          },
        ]}
      />,
    );

    expect(screen.getByText(/United States \/ English - yesterday/)).toBeInTheDocument();
    expect(screen.getByText("Germany / German - just now")).toBeInTheDocument();
  });

  it.each([
    {
      cachedUntil: "2026-07-24T00:00:00.000Z",
      expectedCacheLabel: "cached, free for 8 hours",
      expectedScopeLabel: "Spain / Spanish - just now",
      name: "displays a live country-language scope",
      scopeLabel: "Spain / Spanish",
    },
    {
      cachedUntil: "2026-07-23T15:00:00.000Z",
      expectedCacheLabel: "cache expired",
      expectedScopeLabel: "Spain / Spanish - just now",
      name: "displays a derived legacy country-language scope after expiry",
      scopeLabel: "Spain / Spanish",
    },
  ])("$name", ({ cachedUntil, expectedCacheLabel, expectedScopeLabel, scopeLabel }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T16:00:00.000Z"));

    render(
      <RecentResearchSearches
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        searches={[{ ...search, cachedUntil, createdAt: new Date().toISOString(), scopeLabel }]}
      />,
    );

    expect(JSON.stringify({ cacheLabel: expectedCacheLabel, scopeLabel: expectedScopeLabel })).toBe(
      JSON.stringify({
        cacheLabel: screen.getByText(expectedCacheLabel).textContent,
        scopeLabel: screen.getByText(expectedScopeLabel).textContent,
      }),
    );
  });

  it("shows when the cache window has expired", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T16:00:00.000Z"));

    render(<RecentResearchSearches onOpen={vi.fn()} onRemove={vi.fn()} searches={[search]} />);

    expect(screen.getByText("cache expired")).toBeInTheDocument();
  });
  it("shows the retained original charge separately from a free cached read", () => {
    const quote = paymentQuote();
    const originalPayment = {
      actionId: "original",
      quoteId: quote.id,
      option: quote.option,
      state: "settled" as const,
      charge: { ...quote.charge, value: "4", certainty: "measured" as const },
    };
    const payment = {
      ...originalPayment,
      actionId: "cached",
      state: "free" as const,
      charge: { ...originalPayment.charge, value: "0", certainty: "free" as const },
    };
    render(
      <RecentResearchSearches
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        searches={[{ ...search, originalPayment, payment }]}
      />,
    );
    expect(screen.getByText("Original lookup:")).toBeInTheDocument();
    expect(screen.getByText("4 tokens")).toBeInTheDocument();
    expect(screen.queryByText("0 tokens")).not.toBeInTheDocument();
  });

  it("rounds a retained credit amount and exposes the exact value", () => {
    const quote = paymentQuote({
      charge: {
        certainty: "estimate",
        unit: { kind: "credits", key: "bisibility", plural: "Credits", singular: "Credit" },
        value: "9.8889",
      },
    });
    const originalPayment = {
      actionId: "original",
      charge: { ...quote.charge, certainty: "measured" as const },
      option: quote.option,
      quoteId: quote.id,
      state: "settled" as const,
    };
    render(
      <RecentResearchSearches
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        searches={[{ ...search, originalPayment }]}
      />,
    );
    expect(screen.getByText("9.89 Credits")).toHaveAttribute("title", "9.8889 Credits");
  });
});
