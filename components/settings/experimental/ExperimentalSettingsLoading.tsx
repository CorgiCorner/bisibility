import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { experimentalModuleKeys } from "@/lib/settings/experimental-modules";
export function ExperimentalSettingsLoading() {
  return (
    <SettingsRouteLoading activeSection="experimental">
      <section className={settingsCardFrameClassName} data-experimental-settings-loading="">
        <SettingsLoadingBar className="h-[21px] w-40" />
        <SettingsLoadingBar className="mt-1 h-[38px] w-full" />
        <div className="mt-5 flex flex-col gap-2">
          {experimentalModuleKeys.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <SettingsLoadingBar className="h-[22px] w-[38px] shrink-0 rounded-full" />
              <SettingsLoadingBar className="h-5 w-28" />
            </div>
          ))}
        </div>
      </section>
    </SettingsRouteLoading>
  );
}
