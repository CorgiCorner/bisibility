import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { cn } from "@/lib/ui/cn";

const frames = [
  { className: "min-h-[525px] sm:min-h-[386px]", id: "plan" },
  { className: "min-h-[836px] sm:min-h-[531px]", id: "provider-usage" },
] as const;

export function UsageCardsLoading() {
  return (
    <div className="flex w-full max-w-[760px] flex-col gap-3.5">
      {frames.map((frame) => (
        <section
          className={cn(settingsCardFrameClassName, frame.className)}
          data-settings-loading-frame={frame.id}
          key={frame.id}
        >
          <div className="space-y-2">
            <SettingsLoadingBar className="h-4 w-28" />
            <SettingsLoadingBar className="h-3 w-full max-w-[460px]" />
          </div>
          {frame.id === "plan" ? (
            <div className="mt-5 space-y-4">
              <SettingsLoadingBar className="h-6 w-40" />
              <SettingsLoadingBar className="h-[88px] w-full" />
              <SettingsLoadingBar className="h-[72px] w-full" />
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <SettingsLoadingBar className="h-11 w-full" />
              <SettingsLoadingBar className="h-[66px] w-full" />
              <SettingsLoadingBar className="h-[82px] w-full" />
              <SettingsLoadingBar className="h-[82px] w-full" />
              <div
                className="flex items-center gap-4 border-t border-border-soft pt-4"
                data-usage-loading-footer="provider-usage"
              >
                <SettingsLoadingBar className="h-3 w-28" />
                <SettingsLoadingBar className="h-3 w-32" />
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export function UsageLoading() {
  return (
    <SettingsRouteLoading activeSection="usage">
      <UsageCardsLoading />
    </SettingsRouteLoading>
  );
}
