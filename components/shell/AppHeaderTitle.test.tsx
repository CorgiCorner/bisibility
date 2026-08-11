import { AppHeaderTitle } from "@/components/shell/AppHeaderTitle";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/app/prj_7Kd2Qf9m/settings/general" }));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

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
