import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui", () => ({
  ThemeToggle: () => <button aria-label="Toggle theme" type="button" />,
}));

import { CloudTopBar } from "./CloudTopBar";

describe("CloudTopBar", () => {
  it.each(["onboard", "settings"] as const)("renders the theme toggle for %s", (ctx) => {
    render(<CloudTopBar ctx={ctx} />);

    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  });
});
