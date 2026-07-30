import { describe, expect, it } from "vitest";
import { dataSourceStatusColor } from "./data-source-status";

describe("dataSourceStatusColor", () => {
  it.each([
    ["Provider healthy", "var(--green)"],
    ["Provider not connected", "var(--fg-muted)"],
    ["Provider disconnected", "var(--fg-muted)"],
    ["Migration hold active", "var(--yellow)"],
    ["Provider failed", "var(--red)"],
  ])("maps %s to %s", (status, color) => {
    expect(dataSourceStatusColor(status)).toBe(color);
  });
});
