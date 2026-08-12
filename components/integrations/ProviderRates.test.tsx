import type { ProviderRateData } from "@/lib/integrations/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProviderRates } from "./ProviderRates";

const rates = [
  {
    feature: "ranked_keywords",
    label: "Ranked keywords",
    source: "unknown",
    unit: "calls",
  },
  {
    amountCents: 0,
    checkedAt: "2026-07-22T00:00:00.000Z",
    feature: "keyword_metrics",
    label: "Keyword metrics",
    source: "list",
    unit: "calls",
  },
  {
    amountCents: 1,
    fallbackSource: "list",
    feature: "keyword_research",
    label: "Keyword research",
    source: "manual",
    unit: "calls",
  },
] satisfies readonly ProviderRateData[];

describe("ProviderRates", () => {
  it("distinguishes an unresolved rate from a genuine list-price zero", () => {
    render(<ProviderRates connected projectId="prj_1" providerId="dataforseo" rates={rates} />);

    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByText("no rate yet")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.getByText("$0.0000")).toBeInTheDocument();
    expect(screen.getByText("list price, Jul 22")).toBeInTheDocument();
  });

  it("edits one row and exposes only the real fallback action", async () => {
    const updateRate = vi.fn(async () => undefined);
    render(
      <ProviderRates
        connected
        projectId="prj_1"
        providerId="dataforseo"
        rates={rates}
        updateRate={updateRate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Keyword research rate" }));
    expect(screen.getByLabelText("Keyword research rate in USD")).toHaveValue("0.0100");
    expect(screen.getByRole("button", { name: "Use list price" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Keyword metrics rate" }));
    expect(screen.queryByLabelText("Keyword research rate in USD")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Keyword metrics rate in USD")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Use (measured rate|list price)/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Keyword research rate" }));
    fireEvent.click(screen.getByRole("button", { name: "Use list price" }));
    await waitFor(() =>
      expect(updateRate).toHaveBeenCalledWith({
        costPerUnit: null,
        feature: "keyword_research",
        projectId: "prj_1",
        providerId: "dataforseo",
      }),
    );
  });
});
