import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CloudTopBar } from "./CloudTopBar";

describe("CloudTopBar", () => {
  it.each(["onboard", "settings"] as const)("does not render the theme switch for %s", (ctx) => {
    render(<CloudTopBar ctx={ctx} />);

    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /theme/i })).not.toBeInTheDocument();
  });
});
