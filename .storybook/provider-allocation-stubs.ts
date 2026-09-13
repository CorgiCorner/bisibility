export async function refreshProviderConnectionBudgetAction() {
  return {
    unit: "cents",
    used: 14,
    availableAtProvider: { status: "available", amount: 0.86, unit: "usd" },
  };
}
