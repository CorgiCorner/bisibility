import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Disclosure } from "./Disclosure";

describe("Disclosure", () => {
  it("keeps the content in the DOM while collapsed", () => {
    render(
      <Disclosure title="Do competitor rankings cost extra?">
        <p>They are read from the same SERP snapshot.</p>
      </Disclosure>,
    );

    const details = screen.getByText("Do competitor rankings cost extra?").closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("They are read from the same SERP snapshot.")).toBeInTheDocument();
  });

  it("renders open when defaultOpen is set and never groups items into an exclusive set", () => {
    render(
      <>
        <Disclosure defaultOpen title="First">
          <p>First answer</p>
        </Disclosure>
        <Disclosure title="Second">
          <p>Second answer</p>
        </Disclosure>
      </>,
    );

    expect(screen.getByText("First").closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Second").closest("details")).not.toHaveAttribute("open");
    for (const details of document.querySelectorAll("details")) {
      expect(details).not.toHaveAttribute("name");
    }
  });

  it("makes the whole question row the summary and puts the anchor on the answer", () => {
    render(
      <Disclosure anchorId="can-i-cap-my-monthly-serp-spend" headingLevel="h2" title="Cap spend?">
        <p>Yes.</p>
      </Disclosure>,
    );

    const heading = screen.getByRole("heading", { level: 2, name: "Cap spend?" });
    expect(heading.closest("summary")).not.toBeNull();
    expect(document.getElementById("can-i-cap-my-monthly-serp-spend")).toHaveTextContent("Yes.");
  });

  it("rotates the caret on open and uses the motion-token duration", () => {
    render(
      <Disclosure title="Open me">
        <p>Body</p>
      </Disclosure>,
    );

    const caret = screen
      .getByRole("heading", { name: "Open me" })
      .closest("summary")
      ?.querySelector("svg");
    expect(caret).not.toBeNull();
    expect(caret).toHaveClass(
      "transition-transform",
      "duration-[var(--motion-tooltip)]",
      "ease-[var(--ease-in-out)]",
      "group-open:rotate-90",
    );
  });

  it("removes caret motion while preserving the open-state indicator", () => {
    render(
      <Disclosure title="Reduced">
        <p>Body</p>
      </Disclosure>,
    );

    const caret = screen
      .getByRole("heading", { name: "Reduced" })
      .closest("summary")
      ?.querySelector("svg");
    expect(caret).toHaveClass("group-open:rotate-90", "motion-reduce:transition-none");
    expect(caret).not.toHaveClass("motion-reduce:rotate-0");
    expect(caret?.className).not.toContain("duration-150");
  });

  it("does not animate the answer content", () => {
    render(
      <Disclosure title="Static content">
        <p>Body</p>
      </Disclosure>,
    );

    const answer = screen.getByText("Body").parentElement;
    expect(answer?.className).not.toContain("transition-");
    expect(answer?.className).not.toContain("animate-");
    expect(answer?.className).not.toContain("opacity-");
    expect(answer?.className).not.toContain("max-h");
  });
});
