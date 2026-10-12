import { render } from "@testing-library/react";
import type { BudgetRow } from "@usagekit/views";
import { expect, test } from "vitest";
import { UsageCapPill, usageCapFromBudget } from "./usage-cap-pill";

const known = (text: string) => ({ text, unit: "requests", certainty: "measured" as const });
const row: BudgetRow = {
  id: "cap",
  version: 1,
  kind: "group",
  target: "project",
  traffic: { kind: "any" },
  window: "calendar_month",
  unit: "requests",
  used: known("9007199254740993"),
  reserved: known("9007199254740993"),
  limit: known("9007199254740993"),
  remaining: known("0"),
  boundary: { onExceed: "block" },
  alerts: [],
  bar: null,
  warningAt: null,
  epoch: "2026-10-01T00:00:00.000Z",
  resetsAt: "2026-11-01T00:00:00.000Z",
  redacted: false,
  level: "exceeded",
};

test("an exceeded budget retains its percentage and overflow marker", () => {
  const props = usageCapFromBudget(row);
  expect(props.percent).toBe(200);
  const { container } = render(<UsageCapPill {...props} />);
  expect(container.querySelector("[data-usage-over]")).not.toBeNull();
  expect(
    (container.querySelector("[data-usage-track]") as HTMLElement).style.getPropertyValue(
      "--usage-fill",
    ),
  ).toBe("100%");
});

test("arbitrarily large usage remains a finite exceeded percentage", () => {
  const props = usageCapFromBudget({ ...row, used: known("1" + "0".repeat(400)) });
  expect(Number.isFinite(props.percent)).toBe(true);
  expect(props.percent).toBeGreaterThan(100);
});
