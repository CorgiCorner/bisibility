import { generalSettingsCardGeometryClassNames } from "@/components/settings/general/general-settings-layout";
import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { cn } from "@/lib/ui/cn";

export function GeneralSettingsLoading() {
  return (
    <div aria-hidden className="w-full space-y-5 lg:max-w-[640px]" data-general-settings-loading="">
      <GeneralSettingsLoadingFrames />
    </div>
  );
}

function GeneralSettingsLoadingFrames() {
  return (
    <section
      className={cn(
        settingsCardFrameClassName,
        generalSettingsCardGeometryClassNames.projectDetails,
      )}
      data-general-settings-loading-frame="project-details"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 w-full space-y-2 sm:w-auto sm:flex-1">
          <SettingsLoadingBar className="h-4 w-32" />
          <SettingsLoadingBar className="h-3 w-full sm:w-[480px]" />
        </div>
        <SettingsLoadingBar className="h-8 w-16" />
      </div>
      <div className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <SettingsLoadingBar className="h-3 w-20" />
          <SettingsLoadingBar className="h-10 w-full max-w-[340px]" />
        </div>
        <div className="space-y-1.5">
          <SettingsLoadingBar className="h-3 w-28" />
          <SettingsLoadingBar className="h-10 w-full max-w-[340px]" />
          <SettingsLoadingBar className="h-3 w-full max-w-[380px]" />
        </div>
        <div className="space-y-1.5">
          <SettingsLoadingBar className="h-3 w-20" />
          <SettingsLoadingBar className="h-10 w-full max-w-[340px]" />
        </div>
      </div>
    </section>
  );
}

export function GeneralSettingsRouteLoading() {
  return (
    <SettingsRouteLoading activeSection="general">
      <GeneralSettingsLoading />
      <section
        className="mt-5 w-full space-y-3 rounded-card border border-border bg-bg-elev p-5 lg:max-w-[640px]"
        data-general-loading-frame="usage-display"
      >
        <SettingsLoadingBar className="h-[21px] w-40" />
        <div className="flex flex-wrap items-center gap-3">
          <SettingsLoadingBar className="h-[34px] w-44" />
          <SettingsLoadingBar className="h-[34px] w-40" />
        </div>
      </section>
    </SettingsRouteLoading>
  );
}
