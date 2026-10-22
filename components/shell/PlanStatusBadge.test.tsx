import { PlanStatusBadge } from "@/components/shell/PlanStatusBadge";
import { renderWithShellMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const projectRef = "prj_7Kd2Qf9m";
const billingHref = "/app/prj_7Kd2Qf9m/settings/billing";

describe("PlanStatusBadge", () => {
  it("links an active subscription to billing", () => {
    render(<PlanStatusBadge projectRef={projectRef} status={{ kind: "pro" }} />);

    const link = screen.getByRole("link", { name: "Pro" });
    expect(link).toHaveTextContent("Pro");
    expect(link).toHaveAttribute("href", billingHref);
  });

  it("shows the trial length with singular and plural day counts", () => {
    const { rerender } = render(
      <PlanStatusBadge projectRef={projectRef} status={{ days: 1, kind: "trial" }} />,
    );

    expect(screen.getByRole("link", { name: "Trial · 1 day left" })).toHaveAttribute(
      "href",
      billingHref,
    );

    rerender(<PlanStatusBadge projectRef={projectRef} status={{ days: 3, kind: "trial" }} />);

    expect(screen.getByRole("link", { name: "Trial · 3 days left" })).toBeVisible();
  });

  it("collapses the trial to a short label whose accessible name is the full text", () => {
    render(
      <PlanStatusBadge collapsed projectRef={projectRef} status={{ days: 3, kind: "trial" }} />,
    );

    const link = screen.getByRole("link", { name: "Trial · 3 days left" });
    expect(link).toHaveTextContent("Trial");
    expect(link).not.toHaveTextContent("days left");
    expect(link).toHaveAttribute("href", billingHref);
  });

  it("keeps the collapsed Pro indicator named Pro", () => {
    render(<PlanStatusBadge collapsed projectRef={projectRef} status={{ kind: "pro" }} />);

    expect(screen.getByRole("link", { name: "Pro" })).toHaveTextContent("Pro");
  });
});
