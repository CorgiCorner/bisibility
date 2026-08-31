import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertsAllClear, AlertsCaughtUp, AlertsSetupEmpty } from "./AlertsEmptyStates";

describe("AlertsSetupEmpty", () => {
  it("uses a module mark for setup while status states keep icon wells", () => {
    const { rerender } = render(<AlertsSetupEmpty canCreateKeyword projectRef="prj_1" />);
    expect(
      screen
        .getByRole("heading", { name: "No alerts yet" })
        .parentElement?.querySelector('[data-module-mark="soft"]'),
    ).not.toBeNull();

    rerender(<AlertsAllClear activeRuleCount={1} />);
    expect(
      screen
        .getByRole("heading", { name: "All clear" })
        .parentElement?.querySelector("[data-module-mark]"),
    ).toBeNull();

    rerender(<AlertsCaughtUp snoozedCount={1} />);
    expect(
      screen
        .getByRole("heading", { name: "All caught up" })
        .parentElement?.querySelector("[data-module-mark]"),
    ).toBeNull();
  });

  it("shows the keyword action when keyword creation is allowed", () => {
    render(<AlertsSetupEmpty canCreateKeyword projectRef="prj_1" />);

    expect(screen.getByRole("link", { name: "Add keyword" })).toBeVisible();
  });

  it("hides the keyword action when keyword creation is denied", () => {
    render(<AlertsSetupEmpty canCreateKeyword={false} projectRef="prj_1" />);

    expect(screen.queryByRole("link", { name: "Add keyword" })).not.toBeInTheDocument();
  });
});
