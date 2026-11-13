import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import { settingsTagsBlocks, settingsTagsLayoutClassName } from "./settings-tags-layout";

export function SettingsTagsLoading() {
  return (
    <div
      aria-hidden
      className={settingsTagsLayoutClassName}
      data-settings-tags-blocks={settingsTagsBlocks.join(" ")}
      data-settings-tags-loading=""
    >
      <div
        className="flex flex-wrap items-start justify-between gap-3"
        data-settings-tags-section="header"
      >
        <div className="space-y-2">
          <SettingsLoadingBar className="h-4 w-80" />
          <SettingsLoadingBar className="h-3 w-96 max-w-full" />
        </div>
        <SettingsLoadingBar className="h-10 w-24" />
      </div>
      <div data-settings-tags-section="table">
        <SettingsLoadingBar className="h-64 w-full" />
      </div>
      <div className="flex flex-col gap-1" data-settings-tags-section="where">
        <SettingsLoadingBar className="h-4 w-40" />
        <SettingsLoadingBar className="h-4 w-full max-w-3xl" />
      </div>
    </div>
  );
}

export function SettingsTagsRouteLoading() {
  return (
    <SettingsRouteLoading activeSection="tags">
      <SettingsTagsLoading />
    </SettingsRouteLoading>
  );
}
