import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import { PasswordInput } from "./PasswordInput";
import { Pill } from "./Pill";

function emotionCssText() {
  return Array.from(document.querySelectorAll("style[data-emotion]"))
    .map((style) => style.textContent ?? "")
    .join("\n");
}

function pressRulesFor(element: Element) {
  const css = emotionCssText();
  const classes = Array.from(element.classList).filter((className) => className.startsWith("css-"));

  return Array.from(css.matchAll(/[^{}]+\{[^{}]*\}/g))
    .map((match) => match[0])
    .filter((rule) =>
      classes.some((className) => rule.includes(`${className}:active:not(:focus-visible)`)),
    );
}

describe("PasswordInput", () => {
  it("toggles password visibility with accessible labels", () => {
    render(<PasswordInput aria-label="API password" />);

    const input = screen.getByLabelText("API password") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input).toHaveClass("pr-12");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
  });

  it("uses tokenized pointer press feedback without keyboard or reduced-motion transforms", () => {
    render(<PasswordInput aria-label="API password" />);

    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveClass("duration-[var(--motion-press)]");
    expect(toggle).toHaveClass("motion-safe:active:not-focus-visible:scale-[0.97]");
  });
});

describe("house control press feedback", () => {
  it.each(["primary", "secondary", "destructive"] as const)(
    "applies the 0.97 press scale to %s buttons",
    (variant) => {
      render(<Button variant={variant}>Action</Button>);
      const rules = pressRulesFor(screen.getByRole("button", { name: "Action" }));

      expect(rules.some((rule) => rule.includes("scale(0.97)"))).toBe(true);
      expect(rules.every((rule) => rule.includes(":not(.Mui-disabled)"))).toBe(true);
      expect(emotionCssText()).toContain("@media (prefers-reduced-motion: no-preference)");
    },
  );

  it("leaves ghost buttons transform-free", () => {
    render(<Button variant="ghost">Ghost</Button>);
    expect(pressRulesFor(screen.getByRole("button", { name: "Ghost" }))).toHaveLength(0);
  });

  it("limits Pill press feedback to 0.98 with the same guards", () => {
    render(<Pill>Filter</Pill>);
    const rules = pressRulesFor(screen.getByRole("button", { name: "Filter" }));

    expect(rules.some((rule) => rule.includes("scale(0.98)"))).toBe(true);
    expect(rules.every((rule) => rule.includes(":not(.Mui-disabled)"))).toBe(true);
    expect(emotionCssText()).toContain("@media (prefers-reduced-motion: no-preference)");
  });
});
