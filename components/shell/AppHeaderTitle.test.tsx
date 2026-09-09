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

  it.each(["runs/rank-checks", "rank-tracker/runs"])(
    "shows a compact, copyable run ID at %s",
    (path) => {
      const id = "rcr_abcdefghijklmnopqrstuvwx";
      setNavigationState({ pathname: `/app/prj_7Kd2Qf9m/${path}/${id}` });
      render(<AppHeaderTitle />);

      expect(screen.getByRole("heading", { name: "Run" })).toBeVisible();
      expect(screen.getByText("rcr_abcdef").parentElement).toHaveAttribute("title", id);
      expect(screen.queryByText(id)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Copy run ID" })).toBeVisible();
    },
  );

  it("omits the Rank Tracker subtitle", () => {
    setNavigationState({ pathname: "/app/prj_7Kd2Qf9m/rank-tracker" });

    render(<AppHeaderTitle />);

    expect(screen.getByRole("heading", { name: "Rank Tracker" })).toBeVisible();
    expect(screen.queryByText(/tracked keyword/i)).not.toBeInTheDocument();
  });

  it("uses descriptive typography for the Install subtitle", () => {
    setNavigationState({ pathname: "/app/prj_7Kd2Qf9m/install" });

    render(<AppHeaderTitle />);

    expect(
      screen.getByText("Let your AI agent, editor or scripts use the same data you see here."),
    ).not.toHaveClass("font-mono");
    expect(screen.queryByText("example.com")).not.toBeInTheDocument();
  });

  it("uses the open checklist subtitle before setup completion", () => {
    setNavigationState({ pathname: "/app/prj_7Kd2Qf9m/getting-started" });

    render(<AppHeaderTitle setupCompleted={false} />);

    expect(screen.getByText("Four steps to your first positions.")).toBeInTheDocument();
  });

  it("uses the optional follow-up subtitle after setup completion", () => {
    setNavigationState({ pathname: "/app/prj_7Kd2Qf9m/getting-started" });

    render(<AppHeaderTitle setupCompleted />);

    expect(screen.getByText("Done. Everything below is optional.")).toBeInTheDocument();
    expect(screen.queryByText("Four steps to your first positions.")).not.toBeInTheDocument();
  });
});
