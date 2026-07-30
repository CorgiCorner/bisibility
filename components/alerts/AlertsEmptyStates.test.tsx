import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertsSetupEmpty } from "./AlertsEmptyStates";

describe("AlertsSetupEmpty", () => {
  it("shows the keyword action when keyword creation is allowed", () => {
    render(<AlertsSetupEmpty canCreateKeyword projectRef="prj_1" />);

    expect(screen.getByRole("link", { name: "Add keyword" })).toBeVisible();
  });

  it("hides the keyword action when keyword creation is denied", () => {
    render(<AlertsSetupEmpty canCreateKeyword={false} projectRef="prj_1" />);

    expect(screen.queryByRole("link", { name: "Add keyword" })).not.toBeInTheDocument();
  });
});
