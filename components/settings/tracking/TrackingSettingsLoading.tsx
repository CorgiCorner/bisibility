import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import { settingsFieldWidthClassName } from "@/components/settings/shell/settings-field-widths";
import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { trackingCardGeometryClassNames } from "@/components/settings/tracking/tracking-settings-layout";
import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

function Frame({
  children,
  name,
}: Readonly<{ children: ReactNode; name: keyof typeof trackingCardGeometryClassNames }>) {
  return (
    <section
      className={cn(settingsCardFrameClassName, trackingCardGeometryClassNames[name])}
      data-tracking-loading-frame={name}
    >
      {children}
    </section>
  );
}

export function TrackingSettingsLoading() {
  return (
    <div aria-hidden className="max-w-[760px] space-y-5" data-tracking-settings-loading="">
      <Frame name="checkDefaults">
        <div className="flex items-start justify-between gap-4">
          <div className="w-full space-y-2">
            <SettingsLoadingBar className="h-4 w-32" />
            <SettingsLoadingBar className="h-3 w-full max-w-[470px]" />
          </div>
          <SettingsLoadingBar className="h-8 w-16" />
        </div>
        <div className="mt-5 space-y-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="space-y-2" key={index}>
              <SettingsLoadingBar className="h-2.5 w-24" />
              <SettingsLoadingBar
                className={cn("h-10 max-w-full", settingsFieldWidthClassName("field"))}
              />
              <SettingsLoadingBar className="h-2.5 w-full max-w-[360px]" />
            </div>
          ))}
          <SettingsLoadingBar className="h-16 w-full" />
        </div>
      </Frame>
      <Frame name="matchScope">
        <SettingsLoadingBar className="h-4 w-32" />
        <SettingsLoadingBar className="mt-2 h-3 w-full max-w-[430px]" />
        <div className="mt-5 space-y-4">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="space-y-2 border-t border-border-soft pt-3" key={index}>
              <SettingsLoadingBar className="h-3 w-32" />
              <SettingsLoadingBar className="h-3 w-full" />
            </div>
          ))}
        </div>
      </Frame>
      <Frame name="urlInspection">
        <div className="flex items-start justify-between gap-4">
          <div className="w-full space-y-2">
            <SettingsLoadingBar className="h-4 w-28" />
            <SettingsLoadingBar className="h-3 w-full max-w-[430px]" />
          </div>
          <SettingsLoadingBar className="h-8 w-16" />
        </div>
        <div className="mt-5 space-y-2">
          <SettingsLoadingBar className="h-2.5 w-32" />
          <SettingsLoadingBar className="h-10 w-full max-w-[340px]" />
          <SettingsLoadingBar className="mt-4 h-12 w-full" />
        </div>
      </Frame>
      <section className={settingsCardFrameClassName} data-tracking-loading-frame="markets">
        <div className="flex items-start justify-between gap-4">
          <div className="w-full space-y-2">
            <SettingsLoadingBar className="h-4 w-32" />
            <SettingsLoadingBar className="h-3 w-full max-w-[430px]" />
          </div>
          <SettingsLoadingBar className="h-8 w-24" />
        </div>
        <div className="mt-5 space-y-3 border-t border-border-soft pt-4">
          <SettingsLoadingBar className="h-10 w-full" />
          <SettingsLoadingBar className="h-10 w-full" />
        </div>
      </section>
    </div>
  );
}

export function TrackingSettingsRouteLoading() {
  return (
    <SettingsRouteLoading activeSection="tracking">
      <TrackingSettingsLoading />
    </SettingsRouteLoading>
  );
}
