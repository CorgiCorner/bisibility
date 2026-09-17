import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EstimateStatus } from "./EstimateStatus";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      retry: "Try again",
      unavailable: "Estimate unavailable in this locale.",
      updating: "Refreshing estimate...",
    })[key] ?? key,
}));

function renderStatus(state: Parameters<typeof EstimateStatus>[0]["state"]) {
  return render(<EstimateStatus state={state} />);
}

describe("EstimateStatus", () => {
  it("uses its feature-scoped catalog for error recovery", () => {
    const retry = vi.fn();
    renderStatus({ data: null, retry, status: "error" });

    expect(screen.getByRole("status")).toHaveTextContent("Estimate unavailable in this locale.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("uses its feature-scoped catalog while refreshing", () => {
    renderStatus({ data: null, retry: vi.fn(), status: "loading" });

    expect(screen.getByRole("status")).toHaveTextContent("Refreshing estimate...");
  });
});
