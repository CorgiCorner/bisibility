import { ExpandableCard, type ExpandableCardView } from "@/components/ui/ExpandableCard";
import {
  renderWithFeatureMessages,
  sharedControlTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

function render(ui: React.ReactElement) {
  return renderWithFeatureMessages(ui, { messages: sharedControlTestMessages });
}

describe("ExpandableCard", () => {
  it("names the expand button after the card and opens a full-size modal with a close button", async () => {
    const user = userEvent.setup();
    render(
      <ExpandableCard title="Top queries">
        <p>inline body</p>
      </ExpandableCard>,
    );

    const expand = screen.getByRole("button", { name: "Expand Top queries" });
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(expand);

    const dialog = screen.getByRole("dialog");
    expect(dialog.style.width).toBe("calc(100vw - 48px)");
    expect(dialog.style.height).toBe("calc(100dvh - 48px)");
    expect(within(dialog).getByRole("heading", { name: "Top queries" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Close modal" })).toBeVisible();
  });

  it("returns focus to the expand button when the modal closes", async () => {
    const user = userEvent.setup();
    render(
      <ExpandableCard title="Top pages">
        <p>inline body</p>
      </ExpandableCard>,
    );

    const expand = screen.getByRole("button", { name: "Expand Top pages" });
    await user.click(expand);
    await user.click(screen.getByRole("button", { name: "Close modal" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(expand).toHaveFocus();
  });

  it("passes the view to the render prop and never duplicates an id while open", async () => {
    const user = userEvent.setup();
    const seen: ExpandableCardView[] = [];
    render(
      <ExpandableCard title="Rows">
        {(view) => {
          seen.push(view);
          return <input aria-label={`Search ${view}`} id={`rows-search-${view}`} />;
        }}
      </ExpandableCard>,
    );

    await user.click(screen.getByRole("button", { name: "Expand Rows" }));

    expect(new Set(seen)).toEqual(new Set(["inline", "expanded"]));
    const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("hides the expand button when the consumer marks the card not expandable", () => {
    render(
      <ExpandableCard expandable={false} title="Empty">
        <p>nothing here</p>
      </ExpandableCard>,
    );

    expect(screen.queryByRole("button", { name: /Expand/ })).toBeNull();
  });

  it("makes the inline copy inert while the modal is open", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ExpandableCard title="Top queries">
        {(view) => (
          <button onClick={onClick} type="button">
            row {view}
          </button>
        )}
      </ExpandableCard>,
    );

    await user.click(screen.getByRole("button", { name: "Expand Top queries" }));

    const inlineRegion = document.querySelector("[inert]") as HTMLElement;
    expect(inlineRegion).not.toBeNull();
    expect(within(inlineRegion).getByText("row inline")).toBeInTheDocument();
  });
});
