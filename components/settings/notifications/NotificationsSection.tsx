import { SettingsSection } from "@/components/settings/SettingsSection";
import { MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY } from "@/lib/alerts/limits";
import { appPath } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import {
  ArrowUpRightIcon as ArrowUpRight,
  CheckCircleIcon as CheckCircle,
} from "@phosphor-icons/react/dist/ssr";

type NotificationsData = {
  channel: "Email";
  digest: "Daily";
  email: string;
  emailVerification: "verified" | "unverified";
  maxAlertsPerDay: number;
};

export type NotificationsSectionProps = {
  notifications: NotificationsData;
  projectRef: string;
};

const labelClass =
  "flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint";
const valueClass =
  "flex min-h-10 items-center rounded-lg border border-border-strong bg-bg-sunken px-3 text-[13px] font-medium text-fg";

export function NotificationsSection({
  notifications,
  projectRef,
}: Readonly<NotificationsSectionProps>) {
  return (
    <SettingsSection
      action={
        <a
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border-strong bg-bg-elev px-3 text-[12.5px] font-semibold text-fg-muted hover:border-accent hover:text-accent"
          href={appPath(projectRef, "alerts")}
        >
          Alert rules
          <ArrowUpRight size={13} weight="bold" />
        </a>
      }
      description={`A daily cap of ${MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY} delivery batches per rule keeps alerts meaningful. One batch can fan out to every recipient, webhook endpoint and Slack.`}
      title="Notifications & reports"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={labelClass}>
          {"Default channel "}
          <span className={valueClass}>{notifications.channel}</span>
        </div>
        <div className={labelClass}>
          {"Digest "}
          <span className={valueClass}>{notifications.digest}</span>
        </div>
        <div className={cn(labelClass, "sm:col-span-1")}>
          <span className="flex flex-wrap items-center gap-2">
            {"Notification email "}
            <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2 py-0.5 text-[9px] font-semibold text-green">
              <CheckCircle size={11} weight="fill" />
              Verified
            </span>
          </span>
          <span className={cn(valueClass, "font-mono")}>{notifications.email}</span>
          <span className="normal-case tracking-normal text-fg-faint">
            Verified when you signed in with a login code. Change it to send a new code to the new
            address.
          </span>
        </div>
        <div className={labelClass}>
          {"Max delivery batches / rule / day "}
          <span className={cn(valueClass, "font-mono")}>{notifications.maxAlertsPerDay}</span>
        </div>
      </div>
    </SettingsSection>
  );
}
