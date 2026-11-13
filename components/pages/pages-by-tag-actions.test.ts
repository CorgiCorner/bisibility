import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { byTagActionsMinSize } from "./PagesByTagPanel";

const tableScale = 4;

describe("pages by tag actions", () => {
  it("keeps Edit rule on one line", () => {
    expect(byTagActionsMinSize % tableScale).toBe(0);
    expect(byTagActionsMinSize).toBeGreaterThanOrEqual(160);
    const source = readFileSync(new URL("./PagesByTagPanel.tsx", import.meta.url), "utf8");
    const editAt = source.indexOf('t("byTag.edit")');
    const edit = source.slice(editAt - 500, editAt);
    expect(edit).toContain("whitespace-nowrap");
    expect(source).toContain("minSize: byTagActionsMinSize");
  });
});
