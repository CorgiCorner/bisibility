import type { CheckNotificationSettingValue } from "@/lib/notifications/preference-defaults";

export function summaryAction(input: {
  mode: CheckNotificationSettingValue;
  manual: boolean;
  count: number;
  significant: boolean;
  existing: { readAt: Date | null; withdrawnAt: Date | null } | null;
}) {
  if (input.mode === "none") return "skip";
  if (input.manual) return input.count > 0 || input.existing ? "upsert" : "skip";
  if (input.mode === "all") return input.count > 0 || input.existing ? "upsert" : "skip";
  if (input.significant) return "upsert";
  if (!input.existing || input.existing.withdrawnAt) return "skip";
  return input.existing.readAt === null ? "withdraw" : "upsert";
}
