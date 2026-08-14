import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentResearchSearches } from "./RecentResearchSearches";

const search = {
  cachedUntil: "2026-07-22T20:00:00.000Z",
  connectionId: "conn_a00000000000000000000000",
  createdAt: "2026-07-22T08:00:00.000Z",
  includeClickstream: false,
  market: "United States",
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
    ["2026-07-22T20:00:00.000Z", "cached, free for 10h"],
    ["2026-07-22T16:00:00.000Z", "cached, free for 6h"],
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
            market: "United States",
            mode: "auto",
            resultLimit: 100,
            seed: "rank tracker",
          },
          {
            cachedUntil: "2026-07-24T00:00:00.000Z",
            createdAt: "2026-07-23T16:00:00.000Z",
            includeClickstream: false,
            market: "Germany",
            mode: "ideas",
            resultLimit: 100,
            seed: "seo tool",
          },
        ]}
      />,
    );

    expect(screen.getByText("United States - yesterday")).toBeInTheDocument();
    expect(screen.getByText("Germany - just now")).toBeInTheDocument();
  });

  it("shows when the cache window has expired", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T16:00:00.000Z"));

    render(<RecentResearchSearches onOpen={vi.fn()} onRemove={vi.fn()} searches={[search]} />);

    expect(screen.getByText("cache expired")).toBeInTheDocument();
  });
});
