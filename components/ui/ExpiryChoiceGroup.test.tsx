import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpiryChoiceGroup, type ExpiryChoiceOption } from "./ExpiryChoiceGroup";

type ProjectDays = 30 | 90 | null;
const projectOptions: readonly ExpiryChoiceOption<ProjectDays>[] = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: null, label: "No expiry" },
];

function group(): HTMLElement {
  return screen.getByRole("group", { name: "Expires" });
}

function radio(name: string): HTMLElement {
  return screen.getByRole("radio", { name });
}

describe("ExpiryChoiceGroup", () => {
  it("renders a fieldset group with labeled native radios", () => {
    render(<ExpiryChoiceGroup onChange={vi.fn()} options={projectOptions} value={30} />);
    expect(group()).toBeInTheDocument();
    expect(radio("30 days")).toHaveAttribute("type", "radio");
    expect(radio("90 days")).toHaveAttribute("type", "radio");
    expect(radio("No expiry")).toHaveAttribute("type", "radio");
  });

  it("reflects the controlled checked state on the matching radio", () => {
    render(<ExpiryChoiceGroup onChange={vi.fn()} options={projectOptions} value={90} />);
    expect(radio("90 days")).toBeChecked();
    expect(radio("30 days")).not.toBeChecked();
    expect(radio("No expiry")).not.toBeChecked();
  });

  it("shares one stable group name across radios", () => {
    render(<ExpiryChoiceGroup onChange={vi.fn()} options={projectOptions} value={30} />);
    const names = new Set(screen.getAllByRole("radio").map((r) => r.getAttribute("name")));
    expect(names.size).toBe(1);
  });

  it("calls onChange with the exact generic value, including null", () => {
    const onChange = vi.fn<(days: ProjectDays) => void>();
    render(<ExpiryChoiceGroup onChange={onChange} options={projectOptions} value={30} />);
    fireEvent.click(radio("No expiry"));
    expect(onChange).toHaveBeenCalledWith(null);
    fireEvent.click(radio("90 days"));
    expect(onChange).toHaveBeenCalledWith(90);
  });

  it("applies a peer-focus-visible treatment on the visual option", () => {
    const { container } = render(
      <ExpiryChoiceGroup onChange={vi.fn()} options={projectOptions} value={30} />,
    );
    const spans = container.querySelectorAll("span");
    const visual = Array.from(spans).find((s) =>
      s.className.includes("peer-focus-visible:outline"),
    );
    expect(visual).toBeTruthy();
    expect(visual?.className).toContain("peer-focus-visible:outline-accent-solid");
  });

  it("uses the motion-press token for a short color transition only", () => {
    const { container } = render(
      <ExpiryChoiceGroup onChange={vi.fn()} options={projectOptions} value={30} />,
    );
    const visual = Array.from(container.querySelectorAll("span")).find((s) =>
      s.className.includes("peer-focus-visible"),
    );
    expect(visual?.className).toContain("duration-[var(--motion-press)]");
    expect(visual?.className).not.toMatch(/translate|scale|slide|bounce/);
  });

  it("contains no aria-pressed or transform-based markup", () => {
    const { container } = render(
      <ExpiryChoiceGroup onChange={vi.fn()} options={projectOptions} value={30} />,
    );
    expect(container.querySelector("[aria-pressed]")).toBeNull();
    const allClass = Array.from(container.querySelectorAll("*"))
      .map((el) => el.className)
      .join(" ");
    expect(allClass).not.toMatch(/translate|scale-|slide|bounce/);
  });
});
