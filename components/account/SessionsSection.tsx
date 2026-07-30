import { MonoText } from "@/components/ui";
import type { ActiveSession } from "@/lib/queries/account";
import {
  DeviceMobileIcon as DeviceMobile,
  MonitorIcon as Monitor,
} from "@phosphor-icons/react/dist/ssr";
import { rowListClass } from "./account-ui";
import { RevokeSessionButton } from "./RevokeSessionButton";
import { SignOutEverywhereButton } from "./SignOutEverywhereButton";

export type SessionsSectionProps = {
  revokeSession: (input: { sessionId: string }) => Promise<{ revoked: boolean }>;
  sessions: readonly ActiveSession[];
  signOutEverywhere: () => Promise<{ revokedCount: number }>;
};

function isMobile(device: string): boolean {
  return /iOS|Android/.test(device);
}

function sessionLabel(device: string): string {
  return device.replace(" on ", " · ");
}

export function SessionsSection({
  revokeSession,
  sessions,
  signOutEverywhere,
}: Readonly<SessionsSectionProps>) {
  const otherSessionCount = sessions.filter((session) => !session.current).length;

  return (
    <section>
      <div className="text-[15px] font-semibold text-fg">Active sessions</div>
      <p className="m-0 mt-[3px] text-[12.5px] leading-normal text-fg-muted">
        Devices currently signed in to your account.
      </p>
      <div className="mt-[14px] overflow-hidden rounded-[14px] border border-border bg-bg-elev">
        <div className={rowListClass}>
          {sessions.map((session) => {
            const Icon = isMobile(session.device) ? DeviceMobile : Monitor;
            return (
              <div className="flex items-center gap-[13px] px-[18px] py-[14px]" key={session.id}>
                <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-bg-sunken text-fg-muted">
                  <Icon size={18} weight="bold" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-fg">
                      {sessionLabel(session.device)}
                    </span>
                    {session.current ? (
                      <span className="inline-flex items-center rounded-full bg-green/10 px-[7px] py-px font-mono text-[9px] text-green">
                        This device
                      </span>
                    ) : null}
                  </span>
                  <MonoText className="mt-0.5 truncate text-[11px]" muted>
                    {session.location} · {session.createdLabel}
                  </MonoText>
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
