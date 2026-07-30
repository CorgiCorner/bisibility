import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Calendar } from "./Calendar";

function Harness({ max }: Readonly<{ max?: string }>) {
  const [value, setValue] = useState("2026-07-20");
  return <Calendar max={max} onChange={setValue} value={value} />;
}

describe("Calendar", () => {
  it("renders the month of the selected value and selects a day", () => {
    const onChange = vi.fn();
    render(<Calendar onChange={onChange} value="2026-07-20" />);

    expect(screen.getByText("July 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "July 15, 2026" }));
    expect(onChange).toHaveBeenCalledWith("2026-07-15");
  });

  it("disables days after the max and blocks their selection", () => {
    const onChange = vi.fn();
    render(<Calendar max="2026-07-24" onChange={onChange} value="2026-07-20" />);

    const future = screen.getByRole("button", { name: "July 25, 2026" });
    expect(future).toBeDisabled();
    fireEvent.click(future);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("navigates months with the previous control", () => {
    render(<Calendar onChange={vi.fn()} value="2026-07-20" />);

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("June 2026")).toBeInTheDocument();
  });

  it("moves focus with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    screen.getByRole("button", { name: "July 20, 2026" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "July 21, 2026" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "July 28, 2026" })).toHaveFocus();
  });

  it("clamps arrow navigation to the max day", async () => {
    const user = userEvent.setup();
    render(<Harness max="2026-07-24" />);

    const selected = screen.getByRole("button", { name: "July 20, 2026" });
    selected.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "July 24, 2026" })).toHaveFocus();
  });
});
