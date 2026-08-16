import { UsageSettingsContent } from "@/components/settings/usage/UsageSettingsContent";
import type { ProviderUsageData } from "@/lib/settings/options";
import { DOCS_URL, MARKETING_URL } from "@/lib/site/site";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usage: ProviderUsageData = {
  budget: { capCents: 5_000, spentCents: 1_240 },
  connections: [
    {
      connectionId: "conn_primary",
      costPerCheck: "$0.0006",
      lookups: { costCents: 494, count: 4_120 },
      primary: true,
      provider: "Primary provider",
      rankChecks: { costCents: 446, count: 7_440 },
    },
    {
      connectionId: "conn_secondary",
      costPerCheck: "$0.0150",
      lookups: { costCents: 297, count: 1_485 },
      primary: false,
      provider: "Secondary provider",
      rankChecks: { costCents: 3, count: 2 },
    },
  ],
  hasProvider: true,
  onPaceCents: 1_750,
  primaryProvider: "Primary provider",
  serpChecksMonth: "7,442",
};

const actions = {
  submitPricingFeedback: vi.fn(async () => ({ answered: true as const })),
  updateBudget: vi.fn(async () => ({ capCents: 7_500 })),
};

describe("UsageSettingsContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps WTP out of self-hosted installs", () => {
    render(
      <UsageSettingsContent
        {...actions}
        canEditBudget
        canSubmitPricingFeedback
        deployment="self-host"
        projectId="prj_story"
        usage={usage}
      />,
    );

    expect(screen.getByText("Self-hosted")).toBeInTheDocument();
    expect(screen.queryByLabelText("What would you pay per month?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send feedback" })).not.toBeInTheDocument();
  });

  it("renders hosted pricing feedback only for the hosted beta", () => {
    render(
      <UsageSettingsContent
        {...actions}
        canEditBudget
        canSubmitPricingFeedback
        deployment="cloud"
        projectId="prj_story"
        usage={usage}
      />,
    );

    expect(screen.getByText("Hosted plan")).toBeInTheDocument();
    expect(screen.getByText("Free beta")).toBeInTheDocument();
    expect(screen.getByLabelText("What would you pay per month?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeInTheDocument();
  });

  it("renders the literal answered state without a second form", () => {
    render(
      <UsageSettingsContent
        {...actions}
        canEditBudget
        canSubmitPricingFeedback
        deployment="cloud"
        initialPricingFeedbackAnswered
        projectId="prj_story"
        usage={usage}
      />,
    );

    expect(screen.getByText("Thanks, your answer helps us set the price.")).toBeInTheDocument();
    expect(screen.queryByLabelText("What would you pay per month?")).not.toBeInTheDocument();
  });

  it("uses a segmented provider meter and omits every cost-per-check stat", () => {
    render(
      <UsageSettingsContent
        {...actions}
        canEditBudget
        canSubmitPricingFeedback
        deployment="cloud"
        projectId="prj_story"
        usage={usage}
      />,
    );

    expect(screen.getByRole("meter", { name: /Provider spend/ })).toBeInTheDocument();
    expect(screen.getByText("Primary provider $9.40")).toBeInTheDocument();
    expect(screen.getByText("Secondary provider $3.00")).toBeInTheDocument();
    expect(screen.queryByText(/cost \/ check/i)).not.toBeInTheDocument();
    expect(screen.queryByText("$0.0006")).not.toBeInTheDocument();
    expect(screen.queryByText("$0.0150")).not.toBeInTheDocument();
  });

  it("keeps provider-usage help and estimation actions in the card footer", () => {
    const { container } = render(
      <UsageSettingsContent
        {...actions}
        canEditBudget
        canSubmitPricingFeedback
        deployment="cloud"
        projectId="prj_story"
        usage={usage}
      />,
    );

    const footer = container.querySelector("[data-provider-usage-footer]");
    expect(footer).toBeInTheDocument();

    const budgets = within(footer as HTMLElement).getByRole("link", {
      name: "How budgets work",
    });
    expect(budgets).toHaveAttribute("href", `${DOCS_URL}/integrations#budget-cap`);
    expect(budgets).toHaveAttribute("target", "_blank");
    expect(budgets).toHaveAttribute("rel", "noreferrer noopener");
    expect(budgets.querySelector("svg")).not.toBeNull();

    const estimate = within(footer as HTMLElement).getByRole("link", {
      name: "Estimate future cost",
    });
    expect(estimate).toHaveAttribute("href", `${MARKETING_URL}/rank-tracking-cost-calculator`);
    expect(estimate).toHaveAttribute("target", "_blank");
    expect(estimate).toHaveAttribute("rel", "noreferrer noopener");
    expect(estimate.querySelector("svg")).not.toBeNull();
  });

  it("submits hosted feedback through the injected server action", async () => {
    const user = userEvent.setup();
    render(
      <UsageSettingsContent
        {...actions}
        canEditBudget
        canSubmitPricingFeedback
        deployment="cloud"
        projectId="prj_story"
        usage={usage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(actions.submitPricingFeedback).toHaveBeenCalledWith({
      monthlyPrice: "20",
      projectId: "prj_story",
    });
    expect(await screen.findByText("Thanks, your answer helps us set the price.")).toBeVisible();
  });

  it("edits the provider budget through the injected audited action", async () => {
    const user = userEvent.setup();
    render(
      <UsageSettingsContent
        {...actions}
        canEditBudget
        canSubmitPricingFeedback
        deployment="cloud"
        projectId="prj_story"
        usage={usage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit budget" }));
    const input = screen.getByRole("textbox", { name: "Monthly budget in dollars" });
    await user.clear(input);
    await user.type(input, "75.00");
    await user.click(screen.getByRole("button", { name: "Save budget" }));

    expect(actions.updateBudget).toHaveBeenCalledWith({
      budgetDollars: "75.00",
      projectId: "prj_story",
    });
    expect(await screen.findByRole("meter", { name: /\$12\.40 of \$75\.00/ })).toBeVisible();
  });

  it("hides budget editing when the server-derived capability is false", () => {
    render(
      <UsageSettingsContent
        {...actions}
        canEditBudget={false}
        canSubmitPricingFeedback={false}
        deployment="cloud"
        projectId="prj_story"
        usage={usage}
      />,
    );

    expect(screen.queryByRole("button", { name: "Edit budget" })).not.toBeInTheDocument();
    expect(screen.getByText("Only the project owner can send pricing feedback.")).toBeVisible();
  });
});
