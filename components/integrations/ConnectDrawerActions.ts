import {
  completeGooglePropertySelection as completeGooglePropertySelectionAction,
  connectProvider as connectProviderAction,
  disconnectProvider as disconnectProviderAction,
  testConnection as testConnectionAction,
  updateProviderCost as updateProviderCostAction,
  updateProviderRate as updateProviderRateAction,
  updateProviderSettings as updateProviderSettingsAction,
} from "@/lib/actions/providers";
import { syncProjectTraffic as syncProjectTrafficAction } from "@/lib/actions/traffic-sync";
import type { ProviderActionHandlers } from "@/lib/integrations/types";

export const demoActions: ProviderActionHandlers = {
  completeGooglePropertySelection: async (input) => ({ property: input.property }),
  connectProvider: async () => undefined,
  disconnectProvider: async () => undefined,
  updateProviderSettings: async () => undefined,
  syncProjectTraffic: async () => ({
    connections: 1,
    keywordSnapshots: 12,
    pageSnapshots: 4,
    runs: [{ status: "succeeded_with_data" }],
  }),
  async testProviderConnection() {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      balance: 41_200,
      message: "Connected.",
      ok: true,
    };
  },
  updateProviderCost: async () => undefined,
  updateProviderRate: async () => undefined,
};

export const serverActions = {
  completeGooglePropertySelection: completeGooglePropertySelectionAction,
  connectProvider: connectProviderAction,
  disconnectProvider: disconnectProviderAction,
  updateProviderSettings: updateProviderSettingsAction,
  syncProjectTraffic: syncProjectTrafficAction,
  testProviderConnection: testConnectionAction,
  updateProviderCost: updateProviderCostAction,
  updateProviderRate: updateProviderRateAction,
} satisfies ProviderActionHandlers;
