import { fixtureTranslate, partialReport } from "@/lib/measurement-help/test-fixtures";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MeasurementHelp } from "./MeasurementHelp";

const props = {
  metricId: "organic_visibility_top20",
  definitionVersion: "v1",
  translate: fixtureTranslate,
  formatCount: (value: number) => String(value),
};

describe("MeasurementHelp", () => {
  it.each(["{Enter}", " "])(
    "opens with %s, Escape closes and restores trigger focus",
    async (key) => {
      const user = userEvent.setup();
      render(<MeasurementHelp {...props} />);
      const trigger = screen.getByRole("button", { name: "Explain: Organic visibility" });
      await user.tab();
      expect(trigger).toHaveFocus();
      expect(trigger).not.toHaveAttribute("title");
      expect(trigger).toHaveClass("h-6", "w-6");
      await user.keyboard(key);
      const dialog = screen.getByRole("dialog", { name: "Organic visibility" });
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(dialog).toHaveAccessibleDescription(
        "A versioned index of organic results in the first 20 positions.",
      );
      expect(
        within(dialog).getByRole("link", { name: "Full explanation: Organic visibility" }),
      ).toHaveAttribute("href", "/guides/rank-measurements#measurement-organic-visibility-top20");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    },
  );

  it("opens by ordinary click and closes explicitly with focus return", async () => {
    const user = userEvent.setup();
    render(<MeasurementHelp {...props} />);
    const trigger = screen.getByRole("button", { name: "Explain: Organic visibility" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on an ordinary touch release without waiting for long press", async () => {
    const user = userEvent.setup();
    render(<MeasurementHelp {...props} />);
    const trigger = screen.getByRole("button", { name: "Explain: Organic visibility" });
    await user.pointer([{ keys: "[TouchA>]", target: trigger }, { keys: "[/TouchA]" }]);
    expect(screen.getByRole("dialog", { name: "Organic visibility" })).toBeInTheDocument();
  });

  it("does not bubble mouse, pointer, or activation keys into a sortable header", () => {
    const sort = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <th onClick={sort} onKeyDown={sort} onKeyUp={sort} onPointerDown={sort}>
              Visibility
              <MeasurementHelp {...props} />
            </th>
          </tr>
        </thead>
      </table>,
    );
    const trigger = screen.getByRole("button", { name: "Explain: Organic visibility" });
    fireEvent.pointerDown(trigger);
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.keyUp(trigger, { key: " " });
    fireEvent.click(trigger);
    expect(sort).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a neutral unknown-version message without current definition or numeric context", async () => {
    const user = userEvent.setup();
    render(<MeasurementHelp {...props} definitionVersion="future-v2" report={partialReport} />);
    await user.click(screen.getByRole("button", { name: "Explain: Organic visibility" }));
    expect(
      screen.getByText("Detailed definition unavailable for this version."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("A versioned index of organic results in the first 20 positions."),
    ).toBeNull();
    expect(screen.queryByText("Expected targets")).toBeNull();
    expect(document.body.textContent).not.toContain("private-provider-payload");
    expect(
      screen.getByRole("link", { name: "Full explanation: Organic visibility" }),
    ).toHaveAttribute("href", "/guides/rank-measurements");
  });

  it.each(["loading", "error"] as const)(
    "keeps static help but suppresses prior counts while context is %s",
    async (state) => {
      const user = userEvent.setup();
      render(<MeasurementHelp {...props} contextState={state} report={partialReport} />);
      await user.click(screen.getByRole("button", { name: "Explain: Organic visibility" }));
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(
        screen.getByText("A versioned index of organic results in the first 20 positions."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Expected targets")).toBeNull();
      expect(screen.getByRole("link")).toBeInTheDocument();
    },
  );

  it("shows missing freshness as unknown and never announces improvement from lost observations", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MeasurementHelp {...props} report={partialReport} />);
    await user.click(screen.getByRole("button", { name: "Explain: Organic visibility" }));
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Comparable paired targets")).toBeInTheDocument();
    rerender(
      <MeasurementHelp
        {...props}
        metricId="average_ranked_position"
        definitionVersion="help-v1"
        report={partialReport}
      />,
    );
    expect(
      screen.getByText("Losing observations alone does not prove improvement."),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("synthetic-private-target");
  });

  it("renders no misleading trigger for an invalid ID or version", () => {
    const { rerender } = render(<MeasurementHelp {...props} metricId="unknown-metric" />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<MeasurementHelp {...props} definitionVersion="<raw>" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("twenty ordinary opens and closes perform no fetch and offer no mutation control", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const user = userEvent.setup();
      render(<MeasurementHelp {...props} report={partialReport} />);
      for (let index = 0; index < 20; index += 1) {
        await user.click(screen.getByRole("button", { name: "Explain: Organic visibility" }));
        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getAllByRole("button")).toHaveLength(1);
        await user.click(within(dialog).getByRole("button", { name: "Close" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      }
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  }, 10_000);
});
