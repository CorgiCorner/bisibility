import { describe, expect, it } from "vitest";
import { summaryAction } from "./significance";

const quiet = { manual: false, count: 1, significant: false, existing: null };
describe("CN-9/CN-14 modes and withdrawal", () => {
  it("sends quiet All and manual Important but no quiet scheduled Important or None", () => {
    expect(summaryAction({ ...quiet, mode: "none", manual: true, significant: true })).toBe("skip");
    expect(summaryAction({ ...quiet, mode: "important" })).toBe("skip");
    expect(summaryAction({ ...quiet, mode: "all" })).toBe("upsert");
    expect(summaryAction({ ...quiet, mode: "important", manual: true })).toBe("upsert");
    expect(summaryAction({ ...quiet, mode: "important", manual: true, count: 0 })).toBe("skip");
  });
  it("withdraws only unread Important scheduled summaries, retaining read and All rows", () => {
    const existing = { readAt: null, withdrawnAt: null };
    expect(summaryAction({ ...quiet, mode: "important", existing })).toBe("withdraw");
    expect(
      summaryAction({ ...quiet, mode: "important", existing: { ...existing, readAt: new Date() } }),
    ).toBe("upsert");
    expect(summaryAction({ ...quiet, mode: "all", existing })).toBe("upsert");
    expect(summaryAction({ ...quiet, mode: "important", manual: true, existing })).toBe("upsert");
    expect(
      summaryAction({
        ...quiet,
        mode: "important",
        existing: { ...existing, withdrawnAt: new Date() },
      }),
    ).toBe("skip");
  });
});
