import type { RunView } from "@/lib/assistant/wire";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RunCost } from "./RunCost";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations:
    () =>
    (key: string, values: Record<string, string> = {}) =>
      [key, ...Object.values(values)].join(" "),
}));

const run = (
  usage: Partial<NonNullable<RunView["usage"]>>,
  status: RunView["status"],
): RunView => ({
  id: "r",
  status,
  modelId: "m",
  provider: "openrouter",
  funding: "credits",
  startedAt: "",
  finishedAt: "",
  error: null,
  usage: {
    inputTokens: 120,
    outputTokens: 30,
    costMicroUsd: "1000",
    certainty: "measured",
    chargedCents: "12.0000",
    ...usage,
  },
  usageUncertain: false,
});

it("marks the charge of a stopped answer as an estimate", () => {
  render(<RunCost run={run({ certainty: "estimated" }, "cancelled")} />);
  const line = screen.getByText(/chargedEstimate/);
  expect(line.textContent).toContain("$0.12");
  expect(line.closest("[data-run-cost]")?.getAttribute("data-run-cost")).toBe("estimated");
});

it("shows the exact charge once the provider-reported correction replaced the estimate", () => {
  render(<RunCost run={run({ certainty: "measured", chargedCents: "10.0000" }, "cancelled")} />);
  expect(screen.getByText(/\bcharged\b/).textContent).toContain("$0.10");
  expect(screen.queryByText(/chargedEstimate/)).toBeNull();
});

it("marks an estimated your-key run without an amount, and hides an active run", () => {
  const byok = {
    ...run({ certainty: "estimated", chargedCents: null }, "failed"),
    funding: "byok" as const,
  };
  const { container, rerender } = render(<RunCost run={byok} />);
  expect(container.textContent).toContain("estimate");
  expect(container.textContent).not.toContain("charged");
  rerender(<RunCost run={{ ...byok, status: "streaming" }} />);
  expect(container.textContent).toBe("");
});
