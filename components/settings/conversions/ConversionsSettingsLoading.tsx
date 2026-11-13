import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import {
  conversionsSettingsBlocks,
  conversionsSettingsLayoutClassName,
} from "./conversions-settings-layout";

export function ConversionsSettingsLoading() {
  return (
    <div
      aria-hidden
      className={conversionsSettingsLayoutClassName}
      data-conversions-blocks={conversionsSettingsBlocks.join(" ")}
      data-settings-conversions-loading=""
    >
      <div data-conversions-section="intro">
        <SettingsLoadingBar className="h-5 w-2/3 max-w-3xl" />
      </div>
      <div data-conversions-section="sources">
        <SettingsLoadingBar className="h-40 w-full" />
      </div>
      <div data-conversions-section="goals">
        <SettingsLoadingBar className="h-64 w-full" />
      </div>
    </div>
  );
}

export function ConversionsSettingsRouteLoading() {
  return (
    <SettingsRouteLoading activeSection="conversions">
      <ConversionsSettingsLoading />
    </SettingsRouteLoading>
  );
}
