import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { OtpInput } from "./OtpInput";

function Harness({ initial = [] as string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return <OtpInput onChange={setValue} value={value} />;
}

function boxes() {
  return screen.getAllByRole("textbox") as HTMLInputElement[];
}

describe("OtpInput", () => {
  it("keeps empty cells transparent and only highlights populated cells", () => {
    render(<Harness initial={["1"]} />);

    const [filled, empty] = boxes();
    expect(filled).toHaveClass("bg-accent-soft", "border-accent");
    expect(empty).toHaveClass("bg-transparent", "border-border-strong");
  });

  it("does not swallow Cmd/Ctrl+V so keyboard paste can fire", () => {
    // Keyboard shortcut keydown must not be prevented before the paste event fires.
    render(<Harness />);
    const first = boxes()[0];

    expect(fireEvent.keyDown(first, { key: "v", metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(first, { key: "v", ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(first, { key: "a", metaKey: true })).toBe(true);
  });

  it("still blocks stray non-digit typing", () => {
    render(<Harness />);
    const first = boxes()[0];

    expect(fireEvent.keyDown(first, { key: "a" })).toBe(false);
    expect(fireEvent.keyDown(first, { key: "5" })).toBe(true);
  });

  it("fills every box when a full code is pasted", () => {
    render(<Harness />);
    const inputs = boxes();

    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => "123456" },
    });

    expect(inputs.map((input) => input.value).join("")).toBe("123456");
  });

  it("strips non-digits and caps a pasted code at the field length", () => {
    render(<Harness />);
    const inputs = boxes();

    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => "12-34-56-78" },
    });

    expect(inputs.map((input) => input.value).join("")).toBe("123456");
  });
});
