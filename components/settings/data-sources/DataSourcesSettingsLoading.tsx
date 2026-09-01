import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";

function CardFrame({ kind }: Readonly<{ kind: "inspection" | "sync" }>) {
  return (
    <section className={settingsCardFrameClassName} data-data-sources-loading-frame={kind}>
      <div className="flex items-start justify-between gap-4">
        <div className="w-full space-y-2">
          <SettingsLoadingBar className="h-4 w-32" />
          <SettingsLoadingBar className="h-3 w-full max-w-[430px]" />
        </div>
        <SettingsLoadingBar className="h-8 w-16" />
      </div>
      <div className="mt-5 space-y-3">
        <SettingsLoadingBar className="h-2.5 w-32" />
        <SettingsLoadingBar className="h-10 w-full max-w-[340px]" />
        <SettingsLoadingBar className="h-12 w-full" />
      </div>
    </section>
  );
}
export function DataSourcesSettingsLoading() {
  return (
    <div className="max-w-[760px] space-y-5" data-data-sources-settings-loading="">
      <CardFrame kind="inspection" />
      <CardFrame kind="sync" />
    </div>
  );
}
export function DataSourcesSettingsRouteLoading() {
  return (
    <SettingsRouteLoading activeSection="data-sources">
      <DataSourcesSettingsLoading />
    </SettingsRouteLoading>
  );
}
