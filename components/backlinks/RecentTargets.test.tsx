import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecentBacklinksTarget } from "./backlinks-workspace-model";
import { RecentTargets } from "./RecentTargets";

const targets: RecentBacklinksTarget[] = [
  {
    cachedUntil: "2026-07-25T10:00:00.000Z",
    fetchedAt: "2026-07-24T08:00:00.000Z",
    includeSubdomains: true,
    resultLimit: 100,
    target: "example.com",
    targetScope: "site",
  },
  {
    cachedUntil: "2026-07-23T10:00:00.000Z",
    fetchedAt: "2026-07-22T08:00:00.000Z",
    includeSubdomains: false,
    resultLimit: 100,
    target: "https://example.org/page",
    targetScope: "page",
  },
];

function RemovableTargets() {
  const [current, setCurrent] = useState(targets);
  return (
    <RecentTargets
      onOpen={() => undefined}
      onRemove={(removed) => setCurrent((items) => items.filter((item) => item !== removed))}
      targets={current}
    />
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RecentTargets", () => {
  it("only shows the cached-free badge while the snapshot is unexpired", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T10:00:00.000Z"));
    render(<RecentTargets onOpen={vi.fn()} onRemove={vi.fn()} targets={targets} />);

    expect(screen.getByText("cached, free for 24h")).toBeInTheDocument();
    expect(screen.getAllByText(/cached, free for/)).toHaveLength(1);
  });

  it("removes a recent target with its revealed X action", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T10:00:00.000Z"));
    render(<RemovableTargets />);

    fireEvent.click(screen.getByRole("button", { name: "Remove example.com from recent targets" }));
    expect(screen.queryByText("example.com")).not.toBeInTheDocument();
    expect(screen.getByText("https://example.org/page")).toBeInTheDocument();
    expect(screen.getByText(/exact page/i)).toBeInTheDocument();
  });
});
