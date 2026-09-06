import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import { describe, expect, it } from "vitest";
import {
  budgetFieldChanged,
  budgetInitialValue,
  buildProviderAllocationPayload,
  providerUsageContextLine,
  validateBudgetField,
} from "./budget-edit-modal-model";

const centsConnection = {
  connectionId: "conn_data",
  unit: "cents",
  allocation: { amountPerMonth: 3000, unit: "cents" },
} as ProviderSpendConnection;

const unitsConnection = {
  connectionId: "conn_serp",
  unit: "units",
  allocation: null,
  used: 412,
  usedPriorMonth: 1280,
} as ProviderSpendConnection;

describe("budget-edit-modal-model", () => {
  it("formats provider usage context for the modal row", () => {
    expect(providerUsageContextLine(unitsConnection)).toBe(
      "412 searches this month · 1,280 searches last month",
    );
  });

  it("treats an empty field as no budget", () => {
    expect(buildProviderAllocationPayload(centsConnection, "")).toEqual({
      allocation: null,
      connectionId: "conn_data",
    });
    expect(budgetFieldChanged({ ...centsConnection, allocation: null }, "")).toBe(false);
    expect(budgetFieldChanged(centsConnection, "")).toBe(true);
  });

  it("rejects zero on blur validation", () => {
    expect(validateBudgetField(centsConnection, "0")).toBe("Enter a positive monthly budget.");
    expect(validateBudgetField(unitsConnection, "0")).toBe("Enter a positive number of units.");
  });

  it("keeps the stored allocation as the initial value", () => {
    expect(budgetInitialValue(centsConnection)).toBe("30.00");
  });
});
