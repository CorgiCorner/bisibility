import { describe, expect, it } from "vitest";
import {
  dataTableEmptyBodyHeight,
  dataTableFooterHeight,
  dataTableHeaderHeight,
  dataTableRowHeight,
  dataTableViewportHeight,
} from "./data-table-density";

describe("dataTableViewportHeight", () => {
  it("sizes to the rows on the page when they fit under the cap", () => {
    expect(dataTableViewportHeight({ density: "compact", maxRows: 10, rows: 3 })).toBe(
      dataTableHeaderHeight + 3 * dataTableRowHeight("compact") + dataTableFooterHeight,
    );
  });

  it("caps the body at maxRows so a larger page scrolls in the same height", () => {
    expect(dataTableViewportHeight({ density: "compact", maxRows: 10, rows: 100 })).toBe(
      dataTableHeaderHeight + 10 * dataTableRowHeight("compact") + dataTableFooterHeight,
    );
  });

  it("holds the empty-state floor when the page has no rows", () => {
    expect(dataTableViewportHeight({ density: "compact", maxRows: 10, rows: 0 })).toBe(
      dataTableHeaderHeight + dataTableEmptyBodyHeight + dataTableFooterHeight,
    );
  });

  it("drops the footer height when the table has no pagination", () => {
    expect(
      dataTableViewportHeight({ density: "compact", footer: false, maxRows: 10, rows: 5 }),
    ).toBe(dataTableHeaderHeight + 5 * dataTableRowHeight("compact"));
  });
});
