import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useUsageDisplaySettings } from "./use-usage-display-settings";

it("never imports a previous browser account's usage display options", () => {
  localStorage.setItem(
    "bisibility:usage-display:v1",
    JSON.stringify({ moneyDisplay: "raw-unit", moneyFractionDigits: 6, quantityFractionDigits: 6 }),
  );
  const { result } = renderHook(() => useUsageDisplaySettings());
  expect(result.current.options).toEqual({
    moneyDisplay: "currency",
    moneyFractionDigits: 2,
    quantityFractionDigits: 2,
  });
});
