import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";

export default function CompetitorsSettingsLoading() {
  return (
    <SettingsRouteLoading activeSection="competitors">
      <section
        className="overflow-hidden rounded-card border border-border p-4"
        data-competitor-set-loading=""
      >
        <SettingsLoadingBar className="h-4 w-28" />
        <SettingsLoadingBar className="mt-2 h-3 w-3/4" />
        <SettingsLoadingBar className="mt-6 h-48 w-full" />
      </section>
    </SettingsRouteLoading>
  );
}
