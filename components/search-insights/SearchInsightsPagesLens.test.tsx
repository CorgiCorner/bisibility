import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TransitionStartFunction } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transition = vi.hoisted(() => ({ pending: false, start: vi.fn() }));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useTransition: (): [boolean, TransitionStartFunction] => [transition.pending, transition.start],
  };
});

import { SearchInsightsPagesLens } from "./SearchInsightsPagesTable";
import { PAGE_LENS_CONTROL_LABEL, PAGE_LENS_TRAFFIC_LABEL } from "./search-insights-copy";

describe("SearchInsightsPagesLens", () => {
  beforeEach(() => {
    transition.pending = false;
    transition.start.mockReset();
    transition.start.mockImplementation((callback) => callback());
    setNavigationState({
      pathname: "/app/prj_1/search-console",
      searchParams: { google: "select", period: "7" },
    });
  });

  it("issues the lens navigation from inside a transition", async () => {
    let insideTransition = false;
    transition.start.mockImplementation((callback) => {
      insideTransition = true;
      callback();
      insideTransition = false;
    });
    routerMock.replace.mockImplementation(() => {
      expect(insideTransition).toBe(true);
    });
    render(<SearchInsightsPagesLens lens="search" showSessions />);

    await userEvent.click(screen.getByRole("radio", { name: PAGE_LENS_TRAFFIC_LABEL }));

    expect(transition.start).toHaveBeenCalledOnce();
  });

  it("marks the lens control busy and disables every option while pending", () => {
    transition.pending = true;
    render(<SearchInsightsPagesLens lens="search" showSessions />);

    const control = screen.getByRole("group", { name: PAGE_LENS_CONTROL_LABEL });
    expect(control).toHaveAttribute("aria-busy", "true");
    for (const option of screen.getAllByRole("radio")) expect(option).toBeDisabled();
    expect(control.querySelector(".MuiCircularProgress-root")).toBeInTheDocument();
  });
});
