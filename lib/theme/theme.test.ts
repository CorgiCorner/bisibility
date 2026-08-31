import { describe, expect, it } from "vitest";
import { theme } from "./theme";

describe("MUI popup surfaces", () => {
  it("gives DataGrid menus a border after global Paper shadows are removed", () => {
    const root = theme.components?.MuiPaper?.styleOverrides?.root;
    expect(root).toMatchObject({
      "&:has(.MuiDataGrid-menuList)": { border: "1px solid var(--border)" },
      boxShadow: "none",
    });
  });
});
