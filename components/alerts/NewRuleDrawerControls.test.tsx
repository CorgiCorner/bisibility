import { renderWithAlertMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { NewRuleForm } from "@/lib/alerts/new-rule-data";
import { screen } from "@testing-library/react";
import type { UseFormRegister } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { ConditionFields, ScopeFields } from "./NewRuleDrawerControls";

function renderCondition(conditionType: NewRuleForm["conditionType"]) {
  const register = vi.fn((name: keyof NewRuleForm) => ({
    name,
    onBlur: vi.fn(),
    onChange: vi.fn(),
    ref: vi.fn(),
  })) as unknown as UseFormRegister<NewRuleForm>;

  render(<ConditionFields conditionType={conditionType} errors={{}} register={register} />);
}

describe("ConditionFields", () => {
  it("keeps rank-based fields on whole-number steps", () => {
    renderCondition("position_drop");

    expect(screen.getByRole("spinbutton", { name: "Drop positions" })).toHaveAttribute("step", "1");
  });

  it("allows decimal steps for CTR percentages", () => {
    renderCondition("ctr_drop");

    expect(screen.getByRole("spinbutton", { name: "CTR drop %" })).toHaveAttribute("step", "0.1");
  });
});

const register = vi.fn((name: keyof NewRuleForm) => ({
  name,
  onBlur: vi.fn(),
  onChange: vi.fn(),
  ref: vi.fn(),
})) as unknown as UseFormRegister<NewRuleForm>;
it.each(["all", "keyword", "tag"] as const)(
  "reserves the target and error slot for %s scope",
  (targetType) => {
    const { container } = render(
      <ScopeFields
        errors={{ targetIds: { type: "custom", message: "Select at least one target." } }}
        register={register}
        setValue={vi.fn()}
        targetId=""
        targetType={targetType}
        targets={{ keywords: [], tags: [], members: [], markets: [] }}
      />,
    );
    const slot = container.querySelector("[data-alert-target-slot]");
    expect(slot).toHaveClass("h-[100px]");
    if (targetType === "all") expect(screen.queryByRole("button", { name: "Target" })).toBeNull();
    else expect(screen.getByText("Select at least one target.")).toBeVisible();
  },
);
it.each([
  "position_drop",
  "ctr_drop",
  "threshold",
  "change_pct",
  "exits_top_n",
  "enters_top_n",
  "competitor_overtake",
  "serp_feature",
  "url_mismatch",
  "downtrend",
] as const)("reserves the condition and error slot for %s", (conditionType) => {
  const { container } = render(
    <ConditionFields
      conditionType={conditionType}
      errors={{ topN: { type: "custom", message: "Choose a positive position." } }}
      register={register}
    />,
  );
  expect(container.querySelector("[data-alert-condition-slot]")).toHaveClass("h-[100px]");
});
