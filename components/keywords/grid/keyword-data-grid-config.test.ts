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
});

describe("dataGridHeaderSx", () => {
  it("uses the shared table-header background token", () => {
    expect(dataGridHeaderSx.backgroundColor).toBe("var(--table-header-bg)");
    expect(dataGridHeaderSx.backgroundColor).not.toBe("var(--bg-sunken)");
  });

  it("pins 11px mono and 0.5px tracking", () => {
    expect(dataGridHeaderSx.fontSize).toBe("11px");
    expect(dataGridHeaderSx.letterSpacing).toBe("0.5px");
    expect(dataGridHeaderSx.fontFamily).toBe("var(--font-mono), monospace");
  });
});
