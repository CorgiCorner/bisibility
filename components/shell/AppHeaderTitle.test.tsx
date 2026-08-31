import { AppHeaderTitle } from "@/components/shell/AppHeaderTitle";
import { setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  setNavigationState({ pathname: "/app/prj_7Kd2Qf9m/settings/general" });
});

describe("AppHeaderTitle", () => {
  it("keeps the Settings heading but omits the redundant project-domain subtitle", () => {
    render(<AppHeaderTitle />);

    expect(screen.getByRole("heading", { name: "Settings" })).toHaveClass(
      "text-[21px]",
      "font-semibold",
      "tracking-[-0.4px]",
    );
    expect(screen.queryByText("example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Project, providers, team and preferences.")).not.toBeInTheDocument();
  });

  it("uses descriptive typography for the Install subtitle", () => {
    setNavigationState({ pathname: "/app/prj_7Kd2Qf9m/install" });

    render(<AppHeaderTitle />);

    expect(
      screen.getByText("Let your AI agent, editor or scripts use the same data you see here."),
    ).not.toHaveClass("font-mono");
    expect(screen.queryByText("example.com")).not.toBeInTheDocument();
  });
});
