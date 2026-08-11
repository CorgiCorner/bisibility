import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import {
  settingsCardFrameClassName,
  settingsCardGeometryClassNames,
} from "@/components/settings/shell/settings-layout";
import { cn } from "@/lib/ui/cn";

const loadingFrames = [
  {
    className: settingsCardGeometryClassNames.form,
    fields: 3,
    id: "primary",
    kind: "form",
    stacked: true,
  },
  {
    className: settingsCardGeometryClassNames.compact,
    id: "secondary",
    kind: "compact",
  },
] as const;

export function SettingsShellLoading() {
  return (
    <SettingsRouteLoading activeSection="general">
      <div className="space-y-5" data-settings-shell-loading="">
        {loadingFrames.map((frame) => (
          <section
            className={cn(settingsCardFrameClassName, frame.className)}
            data-settings-loading-frame={frame.id}
            key={frame.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 w-full space-y-2 sm:w-auto sm:flex-1">
                <SettingsLoadingBar className="h-4 w-36" />
                <SettingsLoadingBar className="h-3 w-full sm:w-60" />
              </div>
              <SettingsLoadingBar className="h-8 w-16" />
            </div>
            {frame.kind === "compact" ? (
              <div className="mt-5 space-y-4">
                <SettingsLoadingBar className="h-3 w-28" />
                <div className="space-y-2">
                  <SettingsLoadingBar className="h-3 w-full" />
                  <SettingsLoadingBar className="h-3 w-4/5" />
                </div>
              </div>
            ) : (
              <div
                className={cn("mt-5 grid gap-4", frame.stacked ? "grid-cols-1" : "sm:grid-cols-2")}
              >
                {Array.from({ length: frame.fields }, (_, index) => (
                  <div className="space-y-1.5" key={index}>
                    <SettingsLoadingBar className="h-3.5 w-20" />
                    <SettingsLoadingBar className="h-10 w-full" />
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </SettingsRouteLoading>
  );
}
