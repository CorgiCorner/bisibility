import { DataTable } from "@/components/ui/data-table/DataTable";
import {
  renderWithFeatureMessages,
  sharedControlTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { fixtureTranslate } from "@/lib/measurement-help/test-fixtures";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MeasurementHelp } from "./MeasurementHelp";

describe("portaled measurement help in a navigable table", () => {
  it("keeps portaled control activation keys out of its sortable header ancestor", () => {
    const sort = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <th onKeyDown={sort} onKeyUp={sort}>
              Visibility
              <MeasurementHelp
                metricId="organic_visibility_top20"
                definitionVersion="v1"
                translate={fixtureTranslate}
                formatCount={String}
              />
            </th>
          </tr>
        </thead>
      </table>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Explain: Organic visibility" }));
    const close = within(screen.getByRole("dialog")).getByRole("button", { name: "Close" });
    fireEvent.keyDown(close, { key: "Enter" });
    fireEvent.keyUp(close, { key: " " });
    expect(sort).not.toHaveBeenCalled();
  });

  it.each(["glossary", "close"] as const)(
    "keeps %s pointer/click events out of actual row navigation",
    (action) => {
      const navigate = vi.fn();
      const result = renderWithFeatureMessages(
        <DataTable
          ariaLabel="Stored measurements"
          id={`portal-${action}`}
          columns={[
            {
              id: "visibility",
              header: "Visibility",
              cell: () => (
                <MeasurementHelp
                  metricId="organic_visibility_top20"
                  definitionVersion="v1"
                  translate={fixtureTranslate}
                  formatCount={String}
                />
              ),
            },
          ]}
          rows={[{ id: "stored-row" }]}
          onRowClick={navigate}
          sorting={null}
          onSortingChange={vi.fn()}
        />,
        { messages: sharedControlTestMessages },
      );
      fireEvent.click(screen.getByRole("button", { name: "Explain: Organic visibility" }));
      const dialog = screen.getByRole("dialog", { name: "Organic visibility" });
      expect(result.container).not.toContainElement(dialog);
      const control =
        action === "close"
          ? within(dialog).getByRole("button", { name: "Close" })
          : within(dialog).getByRole("link", { name: "Full explanation: Organic visibility" });
      if (action === "glossary")
        expect(control).toHaveAttribute(
          "href",
          "/guides/rank-measurements#measurement-organic-visibility-top20",
        );
      // Keep the actual link and React bubbling while avoiding jsdom's unsupported navigation.
      if (action === "glossary")
        control.addEventListener("click", (event) => event.preventDefault(), { once: true });
      fireEvent.pointerDown(control);
      fireEvent.click(control);
      expect(navigate).not.toHaveBeenCalled();
      if (action === "close") expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );
});
