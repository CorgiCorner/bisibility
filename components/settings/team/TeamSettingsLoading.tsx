import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { teamCardGeometryClassNames } from "@/components/settings/team/team-card-layout";
import { cn } from "@/lib/ui/cn";

const frames = [
  { id: "members", className: teamCardGeometryClassNames.members, rows: 3 },
  {
    id: "pending-invites",
    className: teamCardGeometryClassNames.pendingInvites,
    rows: 3,
  },
  { id: "roles", className: teamCardGeometryClassNames.roles, rows: 8 },
] as const;

export function TeamSettingsContentLoading() {
  return (
    <div className="space-y-3.5" data-team-settings-content-loading="">
      {frames.map((frame) => (
        <section
          className={cn(settingsCardFrameClassName, frame.className)}
          data-settings-loading-frame={frame.id}
          data-team-loading-frame={frame.id}
          key={frame.id}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 w-full space-y-2 sm:w-auto sm:flex-1">
              <SettingsLoadingBar className="h-4 w-32" />
              <SettingsLoadingBar className="h-3 w-64 max-w-full" />
            </div>
          </div>
          <div className="mt-5 overflow-hidden rounded-[10px] border border-border">
            {Array.from({ length: frame.rows }, (_, index) => (
              <div
                className="flex min-h-[42px] items-center gap-3 border-b border-border-soft p-3 last:border-b-0"
                key={index}
              >
                {frame.id === "roles" ? null : (
                  <SettingsLoadingBar className="h-8.5 w-[34px] shrink-0" />
                )}
                <div className="flex-1 space-y-2">
                  <SettingsLoadingBar className="h-3 w-36 max-w-full" />
                  {frame.id === "roles" ? null : (
                    <SettingsLoadingBar className="h-2.5 w-48 max-w-full" />
                  )}
                </div>
                <SettingsLoadingBar className="h-6 w-20" />
              </div>
            ))}
          </div>
          {frame.id === "members" ? (
            <div
              className="mt-5 flex items-center border-t border-border-soft pt-4"
              data-team-loading-footer="members"
            >
              <SettingsLoadingBar className="h-8 w-32" />
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

export function TeamSettingsLoading() {
  return (
    <SettingsRouteLoading activeSection="team">
      <TeamSettingsContentLoading />
    </SettingsRouteLoading>
  );
}
