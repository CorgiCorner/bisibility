import { describe, expect, it } from "vitest";
import { dataGridHeaderSx, keywordGridSx } from "./keyword-data-grid-config";

describe("keywordGridSx", () => {
  it("does not pass the DataGrid row height to cell content as line height", () => {
    expect(keywordGridSx["& .MuiDataGrid-cell"]).toMatchObject({
      alignItems: "center",
      lineHeight: "normal",
    });
  });

  it("routes the column-header style through the canonical dataGridHeaderSx", () => {
    expect(keywordGridSx["& .MuiDataGrid-columnHeaders"]).toBe(dataGridHeaderSx);
  });

  it("leaves row hover and selected fills to MUI DataGrid", () => {
    expect(keywordGridSx).not.toHaveProperty("& .MuiDataGrid-row:hover");
    expect(keywordGridSx).not.toHaveProperty("& .MuiDataGrid-row.Mui-selected");
    expect(keywordGridSx).not.toHaveProperty("& .MuiDataGrid-row.Mui-selected:hover");
  });
});

describe("dataGridHeaderSx", () => {
  it("uses the shared table-header background token", () => {
    expect(dataGridHeaderSx.backgroundColor).toBe("var(--table-header-bg)");
    expect(dataGridHeaderSx.backgroundColor).not.toBe("var(--bg-sunken)");
  });

  it("paints the header-row hairline with --border, matching the card top", () => {
    expect(dataGridHeaderSx["--DataGrid-rowBorderColor"]).toBe("var(--border)");
    expect(dataGridHeaderSx.borderColor).toBe("var(--border)");
    expect(keywordGridSx["& .MuiDataGrid-container--top"]).toEqual({
      "--DataGrid-rowBorderColor": "var(--border)",
    });
    expect(keywordGridSx["& .MuiDataGrid-container--top .MuiDataGrid-row--borderBottom"]).toEqual({
      "& .MuiDataGrid-columnHeader, & .MuiDataGrid-filler, & .MuiDataGrid-scrollbarFiller": {
        borderBottomColor: "var(--border)",
      },
    });
  });

  it("pins 11px mono and 0.5px tracking", () => {
    expect(dataGridHeaderSx.fontSize).toBe("11px");
    expect(dataGridHeaderSx.letterSpacing).toBe("0.5px");
    expect(dataGridHeaderSx.fontFamily).toBe("var(--font-mono), monospace");
  });
});
