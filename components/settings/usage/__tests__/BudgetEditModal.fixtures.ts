import { usageSettingsFeatureTestMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { UsageConnection } from "@/lib/metering/user-views";

export const connections: UsageConnection[] = [
  { connectionId: "conn_serp", provider: "SerpApi", primary: true },
  { connectionId: "conn_data", provider: "DataForSEO", primary: false },
];

export const dialogCopy =
  usageSettingsFeatureTestMessages.projectSettingsUsage.provider.budgetDialog;

export const surfaceLabel = (template: string, provider: string) =>
  template.replace("{provider}", provider);
