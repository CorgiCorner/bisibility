import { isTruthyFlag } from "@/lib/rank-check/dispatcher-config";

export const ACCOUNT_ACCESS_EMAIL_PURPOSES = [
  "sign-in",
  "email-verification",
  "forget-password",
  "change-email",
  "team-invitation",
] as const;
/** Extensions define their own notification purposes; only account-access purposes bypass the switch. */
export type EmailPurpose = string;

export const NOTIFICATIONS_DISABLED_REASON =
  "Notification email is disabled; sign-in and other account-access email remain enabled.";

export function emailNotificationsDisabled() {
  return isTruthyFlag(process.env.EMAIL_NOTIFICATIONS_DISABLED);
}

/** Unknown and omitted purposes fail closed when notification delivery is disabled. */
export function skipEmailNotification(purpose: EmailPurpose = "notification") {
  if (
    !emailNotificationsDisabled() ||
    (ACCOUNT_ACCESS_EMAIL_PURPOSES as readonly string[]).includes(purpose)
  )
    return false;
  console.info(`[email] skipped purpose=${purpose}: notifications disabled`);
  return true;
}
