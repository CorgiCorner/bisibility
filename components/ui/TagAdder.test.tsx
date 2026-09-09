import { TagAdder } from "@/components/ui/TagAdder";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TagAdder", () => {
  it("opens an inline input from the ghost chip", async () => {
    const user = userEvent.setup();
    render(<TagAdder onAdd={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add tag" }));

    expect(screen.getByLabelText("New tag name")).toHaveFocus();
    expect(screen.getByText("↵")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel adding tag" })).toBeInTheDocument();
  });

  it("commits on Enter and keeps the input open", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<TagAdder onAdd={onAdd} />);

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByLabelText("New tag name"), "docs{Enter}");

    expect(onAdd).toHaveBeenCalledWith("docs");
    expect(screen.getByLabelText("New tag name")).toBeInTheDocument();
    expect(screen.getByLabelText("New tag name")).toHaveValue("");
  });

  it("closes on Escape without adding", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<TagAdder onAdd={onAdd} />);

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByLabelText("New tag name"), "docs{Escape}");

    expect(onAdd).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Add tag" })).toBeInTheDocument();
  });

  it("closes on cancel without adding", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<TagAdder onAdd={onAdd} />);

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByLabelText("New tag name"), "docs");
    await user.click(screen.getByRole("button", { name: "Cancel adding tag" }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Add tag" })).toBeInTheDocument();
  });

  it("uses the shared tag schema before adding", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<TagAdder onAdd={onAdd} />);

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByLabelText("New tag name"), `${"a".repeat(49)}{Enter}`);

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Tag names are up to 48 characters.");
  });

  it("uses motion tokens for the editing shell and affordances", async () => {
    const user = userEvent.setup();
    render(<TagAdder onAdd={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add tag" }));

    const shell = screen.getByLabelText("New tag name").parentElement?.parentElement;
    expect(shell).toHaveClass(
      "duration-[var(--motion-tooltip)]",
      "ease-[var(--ease-out)]",
      "origin-left",
    );
    expect(screen.getByText("↵").closest("kbd")).toHaveClass(
      "data-[entered]:opacity-100",
      "data-[entered]:delay-[40ms]",
    );
    expect(screen.getByRole("button", { name: "Cancel adding tag" })).toHaveClass(
      "data-[entered]:delay-[60ms]",
    );
  });

  it("cancels the exit fallback before it fires when unmounted", () => {
    vi.useFakeTimers();
    const clearTimeout = vi.spyOn(globalThis, "clearTimeout");
    const view = render(<TagAdder onAdd={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
    fireEvent.keyDown(screen.getByLabelText("New tag name"), { key: "Escape" });
    view.unmount();

    expect(clearTimeout).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_000));
  });
});
