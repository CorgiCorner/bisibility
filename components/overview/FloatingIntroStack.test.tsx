import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SidebarCollapsedProvider,
  useSidebarCollapsed,
} from "@/components/shell/SidebarCollapsedState";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { FloatingIntroStack } from "./FloatingIntroStack";

it("renders only the active card's content with decorative hidden backs", () => {
  const action = vi.fn();
  const cards = [
    {
      id: "first",
      content: (
        <button type="button" onClick={action}>
          First action
        </button>
      ),
    },
    { id: "second", content: <button type="button">Second action</button> },
    { id: "third", content: <button type="button">Third action</button> },
  ];
  const { rerender } = render(<FloatingIntroStack cards={cards} />);
  const stack = document.querySelector("[data-floating-intro-stack]");
  expect(stack?.parentElement).toBe(document.body);
  expect(stack?.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Second action" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Third action" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "First action" }));
  expect(action).toHaveBeenCalledOnce();
  rerender(<FloatingIntroStack cards={cards.slice(1)} />);
  expect(screen.queryByRole("button", { name: "First action" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Second action" })).toBeVisible();
});

it("renders no artificial stack for a single card and nothing for an empty stack", () => {
  const { rerender } = render(
    <FloatingIntroStack
      cards={[{ id: "only", content: <button type="button">Only action</button> }]}
    />,
  );
  expect(document.querySelectorAll("[data-depth]")).toHaveLength(0);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  rerender(<FloatingIntroStack cards={[]} />);
  expect(document.querySelector("[data-floating-intro-stack]")).toBeNull();
});

it("keeps the server render empty until the client snapshot can create a portal", () => {
  expect(
    renderToString(
      <FloatingIntroStack
        cards={[{ id: "first", content: <button type="button">Action</button> }]}
      />,
    ),
  ).toBe("");
});

it("uses a viewport-constrained nonmodal entrance and removes movement for reduced motion", () => {
  const css = readFileSync(resolve("components/overview/FloatingIntroStack.module.css"), "utf8");
  expect(css).toContain("position: fixed");
  expect(css).toContain("bottom: 80px");
  expect(css).toContain("100dvh - 112px");
  expect(css).toContain("overflow-y: auto");
  expect(css).toContain("@starting-style");
  expect(css).toContain("var(--motion-modal-enter) var(--ease-out)");
  expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*transform: none/);
  expect(css).not.toMatch(/@keyframes|transition:\s*all/);
});

function SidebarToggle() {
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  return (
    <button type="button" onClick={() => setCollapsed(!collapsed)}>
      Toggle sidebar
    </button>
  );
}

it("follows the live sidebar state outside its DOM subtree", () => {
  render(
    <SidebarCollapsedProvider defaultCollapsed={false}>
      <SidebarToggle />
      <FloatingIntroStack cards={[{ id: "a", content: "Card" }]} />
    </SidebarCollapsedProvider>,
  );
  expect(document.querySelector("[data-floating-intro-stack]")).toHaveAttribute(
    "data-sidebar",
    "expanded",
  );
  fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
  expect(document.querySelector("[data-floating-intro-stack]")).toHaveAttribute(
    "data-sidebar",
    "collapsed",
  );
});
