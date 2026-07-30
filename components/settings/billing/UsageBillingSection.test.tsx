import { USAGE_BILLING_TARGET } from "@/components/settings/SettingsSection";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageBillingSection } from "./UsageBillingSection";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

afterEach(() => {
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: originalScrollIntoView,
  });
});

describe("UsageBillingSection", () => {
  it("renders the self-host plan with the Managed Cloud teaser", () => {
    render(
      <UsageBillingSection
        email="owner@example.com"
        projectId="prj_1"
        submitInterest={vi.fn()}
        variant="self-host"
      />,
    );

    expect(screen.getByText("Usage & billing")).toBeInTheDocument();
    expect(screen.getByText(/Self-hosted is free forever/)).toBeInTheDocument();
    expect(screen.getByText("Self-hosted")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Managed Cloud")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.getByText(/help us land it/)).toBeInTheDocument();
    expect(screen.getByText("Self-host")).toBeInTheDocument();
    expect(screen.getByText("Cloud beta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /notify me/i })).toBeInTheDocument();
    expect(screen.queryByText("Invited by")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Usage & billing" })).toHaveAttribute(
      "id",
      USAGE_BILLING_TARGET.id,
    );
    expect(screen.getByRole("region", { name: "Usage & billing" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("renders the cloud beta plan with the inviter", () => {
    render(
      <UsageBillingSection
        email="owner@example.com"
        projectId="prj_1"
        submitInterest={vi.fn()}
        variant="cloud-beta"
      />,
    );

    expect(screen.getByText(/invited beta of Managed Cloud/)).toBeInTheDocument();
    expect(screen.getByText("Managed Cloud")).toBeInTheDocument();
    expect(screen.getByText("Free beta")).toBeInTheDocument();
    expect(screen.getByText("Invited by")).toBeInTheDocument();
    expect(screen.getByText("bisibility team")).toBeInTheDocument();
    expect(screen.getByText(/Free while the beta lasts/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send feedback/i })).toBeInTheDocument();
  });

  it("focuses and scrolls a cross-page hash target with reduced motion respected", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    history.replaceState(null, "", `/app/settings#${USAGE_BILLING_TARGET.id}`);

    render(
      <UsageBillingSection
        email="owner@example.com"
        projectId="prj_1"
        submitInterest={vi.fn()}
        variant="cloud-beta"
      />,
    );

    const target = screen.getByRole("region", { name: "Usage & billing" });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    expect(target).toHaveFocus();
  });

  it("lets a self-host user preview the cloud plan with honest copy", () => {
    render(
      <UsageBillingSection
        email="owner@example.com"
        projectId="prj_1"
        submitInterest={vi.fn()}
        variant="self-host"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cloud beta/i }));

    expect(screen.getByText(/A preview of the invited Managed Cloud beta/)).toBeInTheDocument();
    expect(screen.getByText("Free beta")).toBeInTheDocument();
    expect(screen.queryByText("Invited by")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cloud beta/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /self-host/i }));
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("submits the price answer through the waitlist action", async () => {
    const submitInterest = vi.fn(async () => ({ email: "owner@example.com", ok: true }));
    render(
      <UsageBillingSection
        email="owner@example.com"
        projectId="prj_1"
        submitInterest={submitInterest}
        variant="self-host"
      />,
    );

    fireEvent.change(screen.getByLabelText("What would you pay per month?"), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));

    await waitFor(() =>
      expect(submitInterest).toHaveBeenCalledWith({
        cloudPrice: "custom",
        cloudPriceCustom: "25",
        email: "owner@example.com",
        projectId: "prj_1",
        source: "settings_notify",
      }),
    );
    expect(
      await screen.findByText("You are on the list - we'll reach out shortly about early access."),
    ).toBeInTheDocument();
  });

  it("submits beta feedback intent without a price", async () => {
    const submitInterest = vi.fn(async () => ({ email: "owner@example.com", ok: true }));
    render(
      <UsageBillingSection
        email="owner@example.com"
        projectId="prj_1"
        submitInterest={submitInterest}
        variant="cloud-beta"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    await waitFor(() =>
      expect(submitInterest).toHaveBeenCalledWith({
        email: "owner@example.com",
        projectId: "prj_1",
        source: "settings_feedback",
      }),
    );
    expect(
      await screen.findByText("Thanks, your answer helps us set the price."),
    ).toBeInTheDocument();
  });

  it("shows a friendly error when the submission fails", async () => {
    const submitInterest = vi.fn(async () => Promise.reject("nope"));
    render(
      <UsageBillingSection
        email="owner@example.com"
        projectId="prj_1"
        submitInterest={submitInterest}
        variant="self-host"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));

    expect(await screen.findByText("Unable to send right now.")).toBeInTheDocument();
  });
});
