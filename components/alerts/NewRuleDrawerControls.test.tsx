import type { NewRuleForm } from "@/lib/alerts/new-rule-data";
import { render, screen } from "@testing-library/react";
import type { UseFormRegister } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { ConditionFields } from "./NewRuleDrawerControls";

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
