import { describe, expect, it } from "vitest";
import { keywordGridSx } from "./keyword-data-grid-config";

describe("keywordGridSx", () => {
  it("does not pass the DataGrid row height to cell content as line height", () => {
    expect(keywordGridSx["& .MuiDataGrid-cell"]).toMatchObject({
      alignItems: "center",
      lineHeight: "normal",
    });
  });
});
