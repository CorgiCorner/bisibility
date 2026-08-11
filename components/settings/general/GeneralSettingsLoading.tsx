import { generalSettingsCardGeometryClassNames } from "@/components/settings/general/general-settings-layout";
import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { cn } from "@/lib/ui/cn";

export function GeneralSettingsLoading() {
  return (
    <div aria-hidden className="max-w-[640px] space-y-5" data-general-settings-loading="">
      <GeneralSettingsLoadingFrames />
    </div>
  );
}

function GeneralSettingsLoadingFrames() {
  return (
    <>
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
            <SettingsLoadingBar className="h-10 w-full max-w-[400px]" />
          </div>
          <div className="space-y-1.5">
            <SettingsLoadingBar className="h-3 w-28" />
            <SettingsLoadingBar className="h-10 w-full max-w-[400px]" />
            <SettingsLoadingBar className="h-3 w-full max-w-[380px]" />
          </div>
          <div className="space-y-1.5">
            <SettingsLoadingBar className="h-3 w-20" />
            <SettingsLoadingBar className="h-10 w-full max-w-[400px]" />
          </div>
        </div>
      </section>
      <section
        className={cn(
          settingsCardFrameClassName,
          generalSettingsCardGeometryClassNames.tagsSegments,
        )}
        data-general-settings-loading-frame="tags-segments"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 w-full space-y-2 sm:w-auto sm:flex-1">
            <SettingsLoadingBar className="h-4 w-32" />
            <SettingsLoadingBar className="h-3 w-full sm:w-[420px]" />
          </div>
          <SettingsLoadingBar className="h-8 w-16" />
        </div>
        <div className="mt-5 flex gap-2">
          <SettingsLoadingBar className="h-7 w-20 rounded-full" />
          <SettingsLoadingBar className="h-7 w-24 rounded-full" />
          <SettingsLoadingBar className="h-7 w-16 rounded-full" />
          <SettingsLoadingBar className="h-7 w-24 rounded-full" />
        </div>
      </section>
    </>
  );
}

export function GeneralSettingsRouteLoading() {
  return (
    <SettingsRouteLoading activeSection="general">
      <GeneralSettingsLoading />
    </SettingsRouteLoading>
  );
}
