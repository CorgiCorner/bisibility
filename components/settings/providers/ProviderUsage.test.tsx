import { settingsFixtures } from "@/components/settings/settings-fixtures";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProviderUsage } from "./ProviderUsage";

const emptyUsage = {
  budget: { capCents: 5000, spentCents: 0 },
  connections: [],
  serpChecksMonth: "0",
  primaryProvider: "-",
  hasProvider: false,
  onPaceCents: 0,
};

describe("ProviderUsage", () => {
  it("renders the segmented meter, workspace KPIs and the docs link", () => {
    render(<ProviderUsage usage={settingsFixtures.usage} />);

    expect(screen.getByText("$12.40 / $50.00")).toBeInTheDocument();
    expect(screen.getByText("DataForSEO $9.40")).toBeInTheDocument();
    expect(screen.getByText("SerpAPI $3.00")).toBeInTheDocument();
    expect(screen.getByText("7,442")).toBeInTheDocument();
    expect(screen.getByText("$12.40")).toBeInTheDocument();
    expect(screen.getByText("~$17.50/mo")).toBeInTheDocument();
    const docsLink = screen.getByRole("link", { name: "How budgets work" });
    expect(docsLink).toHaveAttribute("href", "https://bisibility.com/docs/integrations#budget-cap");
    expect(document.getElementById("provider-usage")).not.toBeNull();
  });

  it("renders per-provider blocks with merged count and cost values", () => {
    render(<ProviderUsage usage={settingsFixtures.usage} />);

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("PRIMARY")).toBeInTheDocument();
    expect(screen.getByText("7,440")).toBeInTheDocument();
    expect(screen.getByText("· $4.46")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("· $4.94")).toBeInTheDocument();
    expect(screen.getByText("$0.0006")).toBeInTheDocument();
    expect(screen.getByText("$0.0200")).toBeInTheDocument();
    const estimateLink = screen.getByRole("link", { name: /Estimate future cost/ });
    expect(estimateLink).toHaveAttribute("href", "/rank-tracking-cost-calculator");
  });

  it("hides the cost-calculator link in self-host mode", () => {
    render(<ProviderUsage showCostCalculatorLink={false} usage={settingsFixtures.usage} />);

    expect(screen.queryByRole("link", { name: /Estimate future cost/ })).not.toBeInTheDocument();
  });

  it("marks missing keyword-research capability as not supported in italics", () => {
    render(<ProviderUsage usage={settingsFixtures.usage} />);

    const notSupported = screen.getByText("not supported");
    expect(notSupported).toHaveClass("italic", "text-fg-faint");
  });

  it("hides legend squares next to provider names for a single provider", () => {
    render(
      <ProviderUsage
        usage={{
          ...settingsFixtures.usage,
          connections: [settingsFixtures.usage.connections[0]],
        }}
      />,
    );

    expect(screen.queryByText("DataForSEO $9.40")).not.toBeInTheDocument();
    const row = screen.getAllByRole("listitem")[0];
    expect(row.querySelector('span[aria-hidden="true"]')).toBeNull();
    expect(row).toHaveTextContent("DataForSEO");
  });

  it("renders no connection rows when no provider is connected", () => {
    render(<ProviderUsage usage={emptyUsage} />);

    expect(screen.queryByText("Cost / check")).not.toBeInTheDocument();
    expect(
      screen.getByText("Usage appears once a SERP provider is connected."),
    ).toBeInTheDocument();
  });

  it("hides the Edit budget button entirely without edit permission", () => {
    const { rerender } = render(
      <ProviderUsage
        editBudget={{ canEdit: false, submit: vi.fn() }}
        usage={settingsFixtures.usage}
      />,
    );
    expect(screen.queryByRole("button", { name: /Edit budget/ })).not.toBeInTheDocument();

    rerender(
      <ProviderUsage
        editBudget={{ canEdit: true, submit: vi.fn() }}
        usage={settingsFixtures.usage}
      />,
    );
    expect(screen.getByRole("button", { name: /Edit budget/ })).toBeInTheDocument();
  });

  it("saves a new budget through the dialog and reflects it in the meter", async () => {
    const user = userEvent.setup();
    const submit = vi.fn(async (capCents: number) => ({ capCents }));
    render(<ProviderUsage editBudget={{ canEdit: true, submit }} usage={settingsFixtures.usage} />);

    await user.click(screen.getByRole("button", { name: /Edit budget/ }));
    const input = screen.getByRole("textbox", { name: "Monthly budget in dollars" });
    expect(input).toHaveValue("50.00");

    await user.clear(input);
    await user.type(input, "75");
    await user.click(screen.getByRole("button", { name: "Save budget" }));

    expect(submit).toHaveBeenCalledWith(7500);
    expect(await screen.findByText("$12.40 / $75.00")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("surfaces the server-provided message when saving the budget fails", async () => {
    const user = userEvent.setup();
    const submit = vi.fn(async () => {
      throw new Error("Only workspace owners can change the budget.");
    });
    render(
      <ProviderUsage
        editBudget={{ canEdit: true, submit }}
        initialEditOpen
        usage={settingsFixtures.usage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save budget" }));

    expect(
      await screen.findByText("Only workspace owners can change the budget."),
    ).toBeInTheDocument();
    // The dialog stays open so the user can retry.
    expect(screen.getByRole("textbox", { name: "Monthly budget in dollars" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save budget" })).toBeEnabled();
  });

  it("falls back to generic copy when the save rejection carries no message", async () => {
    const user = userEvent.setup();
    const submit = vi.fn(async () => {
      throw new Error();
    });
    render(
      <ProviderUsage
        editBudget={{ canEdit: true, submit }}
        initialEditOpen
        usage={settingsFixtures.usage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save budget" }));

    expect(await screen.findByText("Could not save the budget. Try again.")).toBeInTheDocument();
  });

  it("blocks invalid budget amounts", async () => {
    const user = userEvent.setup();
    const submit = vi.fn(async (capCents: number) => ({ capCents }));
    render(
      <ProviderUsage
        editBudget={{ canEdit: true, submit }}
        initialEditOpen
        usage={settingsFixtures.usage}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Monthly budget in dollars" });
    await user.clear(input);
    await user.type(input, "12.345");
    expect(screen.getByRole("button", { name: "Save budget" })).toBeDisabled();

    await user.clear(input);
    await user.type(input, "0");
    expect(screen.getByRole("button", { name: "Save budget" })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("closes the dialog on cancel without saving", async () => {
    const user = userEvent.setup();
    const submit = vi.fn(async (capCents: number) => ({ capCents }));
    render(
      <ProviderUsage
        editBudget={{ canEdit: true, submit }}
        initialEditOpen
        usage={settingsFixtures.usage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps the bar hidden and shows month-only amounts when no cap is set", () => {
    render(
      <ProviderUsage
        usage={{
          ...settingsFixtures.usage,
          budget: { capCents: null, spentCents: 1240 },
        }}
      />,
    );

    expect(screen.getByText("$12.40 this month")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How budgets work" })).toBeInTheDocument();
  });
});
