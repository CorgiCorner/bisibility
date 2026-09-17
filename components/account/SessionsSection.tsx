"use client";

import type { ActiveSession } from "@/lib/queries/account";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { MonitorIcon as Monitor } from "@phosphor-icons/react/dist/csr/Monitor";
import { useTranslations } from "next-intl";
import { rowListClass } from "./account-ui";
import { RevokeSessionButton } from "./RevokeSessionButton";
import { SignOutEverywhereButton } from "./SignOutEverywhereButton";

export type SessionsSectionProps = {
  referenceTime: string;
  revokeSession: (input: { sessionId: string }) => Promise<{ revoked: boolean }>;
  sessions: readonly ActiveSession[];
  signOutEverywhere: () => Promise<{ revokedCount: number }>;
};

function isMobile(session: ActiveSession): boolean {
  return session.operatingSystem === "iOS" || session.operatingSystem === "Android";
}

type RelativeActivity = { kind: "justNow" } | { count: number; kind: "minutes" | "hours" | "days" };

function relativeActivity(lastActiveAt: Date, referenceTime: Date): RelativeActivity {
  const minutes = Math.round((referenceTime.getTime() - lastActiveAt.getTime()) / 60000);
  if (minutes < 1) return { kind: "justNow" };
  if (minutes < 60) return { count: minutes, kind: "minutes" };

  const hours = Math.round(minutes / 60);
  if (hours < 24) return { count: hours, kind: "hours" };

  return { count: Math.round(hours / 24), kind: "days" };
}

export function SessionsSection({
  referenceTime,
  revokeSession,
  sessions,
  signOutEverywhere,
}: Readonly<SessionsSectionProps>) {
  const t = useTranslations("account.security.sessions");
  const otherSessionCount = sessions.filter((session) => !session.current).length;
  const initialReferenceTime = new Date(referenceTime);

  function sessionLabel(session: ActiveSession): string {
    return t("device", {
      browser: session.browser ?? t("browserUnknown"),
      operatingSystem: session.operatingSystem ?? t("operatingSystemUnknown"),
    });
  }

  function lastActiveLabel(session: ActiveSession): string {
    const activity = relativeActivity(session.lastActiveAt, initialReferenceTime);
    if (activity.kind === "justNow") return t("activeJustNow");

    if (activity.kind === "minutes") return t("activeMinutes", { count: activity.count });
    if (activity.kind === "hours") return t("activeHours", { count: activity.count });
    return t("activeDays", { count: activity.count });
  }

  return (
    <section>
      <div className="text-[15px] font-semibold text-fg">{t("title")}</div>
      <p className="m-0 mt-[3px] text-[12.5px] leading-normal text-fg-muted">{t("description")}</p>
      <div className="mt-3.5 overflow-hidden rounded-card border border-border bg-bg-elev">
        <div className={rowListClass}>
          {sessions.map((session) => {
            const Icon = isMobile(session) ? DeviceMobile : Monitor;
            return (
              <div className="flex items-center gap-[13px] px-4.5 py-3.5" key={session.id}>
                <span className="grid h-8.5 w-[34px] flex-none place-items-center rounded-control bg-bg-sunken text-fg-muted">
                  <Icon size={18} weight="regular" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-fg">
                      {sessionLabel(session)}
                    </span>
                    {session.current ? (
                      <span className="inline-flex items-center rounded-full bg-green/10 px-[7px] py-px font-sans tabular-nums text-[9px] text-green-text">
                        {t("thisDevice")}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 truncate text-[11px]">
                    {session.ipAddress ?? t("locationUnknown")} · {lastActiveLabel(session)}
                  </span>
                </span>
                {session.current ? null : (
                  <RevokeSessionButton revokeSession={revokeSession} sessionId={session.id} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <SignOutEverywhereButton
        otherSessionCount={otherSessionCount}
        signOutEverywhere={signOutEverywhere}
      />
    </section>
  );
}
