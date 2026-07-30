import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

const mocks = vi.hoisted(() => ({ setMode: vi.fn() }));

vi.mock("@mui/material/styles", () => ({ useColorScheme: () => ({ setMode: mocks.setMode }) }));

describe("ThemeToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.dataset.theme = "light";
    document.body.dataset.theme = "light";
    document.body.innerHTML = '<div data-app-theme-root data-theme="light"></div>';
  });

  it("updates the document, shell, cookie, and MUI mode together", () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.body.dataset.theme).toBe("dark");
    expect(document.querySelector<HTMLElement>("[data-app-theme-root]")?.dataset.theme).toBe(
      "dark",
    );
    expect(document.cookie).toContain("theme=dark");
    expect(mocks.setMode).toHaveBeenCalledWith("dark");
  });
});
