import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import type { SurfaceSpend } from "@/lib/queries/provider-spend-surfaces";
import type { ProviderSpendSourceBlock } from "@/lib/queries/provider-spend-types";
import { describe, expect, it } from "vitest";
import {
  type BudgetFormValues,
  budgetFieldChanged,
  budgetFromCreditBalance,
  budgetFromProviderAvailability,
  budgetInitialValue,
  budgetValidationIssue,
  buildProviderAllocationPayload,
  ProviderAvailabilityBudgetError,
} from "./budget-edit-modal-model";

function surface(allocation: SurfaceSpend["allocation"], used = 0): SurfaceSpend {
  return {
    allocation,
    projectedExhaustionAt: null,
    remaining: null,
    state: allocation ? "ok" : "no_allocation",
    used,
    usedPercent: null,
  };
}

function block(
  unit: ProviderSpendSourceBlock["unit"],
  app: SurfaceSpend["allocation"],
  programmatic: SurfaceSpend["allocation"] = null,
  used = 0,
): ProviderSpendSourceBlock {
  return {
    requestCount: 0,
    surfaces: { app: surface(app, used), programmatic: surface(programmatic) },
    unconfirmedCount: 0,
    unit,
    used,
    usedPriorMonth: 0,
  };
}

function connection(
  own: ProviderSpendSourceBlock,
  credits: ProviderSpendSourceBlock = block("cents", null),
): ProviderSpendConnection {
  return { connectionId: "conn_data", credits, own } as ProviderSpendConnection;
}

function values(
  ownApp: string,
  ownProgrammatic = "",
  creditsApp = "",
  creditsProgrammatic = "",
): BudgetFormValues {
  return {
    credits: { app: creditsApp, programmatic: creditsProgrammatic },
    own: { app: ownApp, programmatic: ownProgrammatic },
  };
}

const centsOwn = block("cents", { amountPerMonth: 3000, unit: "cents" });
const unitsOwn = block(
  "units",
  { amountPerMonth: 1000, unit: "units" },
  { amountPerMonth: 400, unit: "units" },
);

describe("budget form values", () => {
  it("formats stored cents as dollars and units as whole numbers", () => {
    expect(budgetInitialValue(connection(centsOwn), "own", "app")).toBe("30.00");
    expect(budgetInitialValue(connection(unitsOwn), "own", "programmatic")).toBe("400");
    expect(budgetInitialValue(connection(centsOwn), "credits", "app")).toBe("");
  });

  it("treats an emptied field as a change only when a budget was stored", () => {
    const stored = connection(centsOwn);
    expect(budgetFieldChanged(stored, "", "own", "app")).toBe(true);
    expect(budgetFieldChanged(stored, "", "credits", "app")).toBe(false);
    expect(budgetFieldChanged(stored, "30.00", "own", "app")).toBe(false);
    expect(budgetFieldChanged(stored, "12.00", "own", "app")).toBe(true);
  });
});

describe("buildProviderAllocationPayload", () => {
  it("omits an unchanged programmatic cap so the stored value is kept", () => {
    expect(buildProviderAllocationPayload(connection(centsOwn), values("40.50"))).toEqual({
      allocation: { amountDollars: "40.50", unit: "cents" },
      connectionId: "conn_data",
    });
  });

  it("clears both own budgets when both fields are emptied", () => {
    expect(buildProviderAllocationPayload(connection(unitsOwn), values("", ""))).toEqual({
      allocation: null,
      connectionId: "conn_data",
      programmaticAllocation: null,
    });
  });

  it("sends a credits budget only when a credits field changes", () => {
    const withCredits = connection(
      centsOwn,
      block("cents", { amountPerMonth: 500, unit: "cents" }),
    );
    expect(buildProviderAllocationPayload(withCredits, values("30.00", "", "12.00", ""))).toEqual({
      connectionId: "conn_data",
      creditsAllocation: { amountDollars: "12.00", unit: "cents" },
    });
  });
});

describe("budgetFromProviderAvailability", () => {
  it("adds this month's own-key app usage to the provider balance", () => {
    const row = {
      ...connection(block("cents", { amountPerMonth: 1000, unit: "cents" }, null, 14)),
      availableAtProvider: { amount: 0.86, status: "available", unit: "usd" },
    } as ProviderSpendConnection;
    expect(budgetFromProviderAvailability(row)).toBe("1.00");
  });

  it("adds remaining searches to own-key unit usage", () => {
    const row = {
      ...connection(block("units", { amountPerMonth: 1000, unit: "units" }, null, 412)),
      availableAtProvider: { amount: 222, status: "available", unit: "searches" },
    } as ProviderSpendConnection;
    expect(budgetFromProviderAvailability(row)).toBe("634");
  });

  it("refuses a balance the catalog unit cannot express", () => {
    const row = {
      ...connection(unitsOwn),
      availableAtProvider: { amount: 1, status: "available", unit: "usd" },
    } as ProviderSpendConnection;
    expect(() => budgetFromProviderAvailability(row)).toThrow(ProviderAvailabilityBudgetError);
  });
});

describe("budgetFromCreditBalance", () => {
  it("adds credits spent on the app surface to the wallet balance", () => {
    const row = connection(centsOwn, block("cents", null, null, 25));
    expect(budgetFromCreditBalance(row, 475)).toBe("5.00");
  });

  it("refuses an empty wallet", () => {
    expect(() => budgetFromCreditBalance(connection(centsOwn), 0)).toThrow(
      ProviderAvailabilityBudgetError,
    );
  });
});

describe("budgetValidationIssue", () => {
  it("rejects fractional units and oversized money", () => {
    expect(budgetValidationIssue(connection(unitsOwn), "1.5", "own")).toBe("wholeUnits");
    expect(budgetValidationIssue(connection(centsOwn), "0", "own")).toBe("positiveMoney");
    expect(budgetValidationIssue(connection(centsOwn), "30.00", "own")).toBeNull();
  });
});
