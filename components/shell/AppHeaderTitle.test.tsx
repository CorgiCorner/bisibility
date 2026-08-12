import { AppHeaderTitle } from "@/components/shell/AppHeaderTitle";
import { setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  setNavigationState({ pathname: "/app/prj_7Kd2Qf9m/settings/general" });
});

describe("AppHeaderTitle", () => {
  it("uses the active project domain as the Settings subtitle with the reference typography", () => {
    render(<AppHeaderTitle projectDomain="example.com" />);

    expect(screen.getByRole("heading", { name: "Settings" })).toHaveClass(
      "text-[21px]",
      "font-semibold",
      "tracking-[-0.4px]",
    );
    expect(screen.getByText("example.com")).toHaveClass("font-mono");
    expect(screen.queryByText("Project, providers, team and preferences.")).not.toBeInTheDocument();
  });
});
