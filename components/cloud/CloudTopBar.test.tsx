import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CloudTopBar } from "./CloudTopBar";

describe("CloudTopBar", () => {
  it.each(["onboard", "settings"] as const)("does not render the theme switch for %s", (ctx) => {
    render(
      <CloudTopBar
        copy={{
          beta: "Cloud",
          fallbackWorkspace: "Project",
          setupProgress: ({ current, total }) => `Setup / ${current} of ${total}`,
        }}
        ctx={ctx}
      />,
    );

    expect(screen.getByText("Cloud")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /theme/i })).not.toBeInTheDocument();
  });
});
