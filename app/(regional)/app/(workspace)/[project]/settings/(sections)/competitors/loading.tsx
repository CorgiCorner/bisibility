import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";

export default function CompetitorsSettingsLoading() {
  return (
    <SettingsRouteLoading activeSection="competitors">
      <section
        className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev"
        data-competitor-set-loading=""
      >
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0 space-y-1">
            <SettingsLoadingBar className="h-[22.5px] w-28" />
            <SettingsLoadingBar className="h-5 w-full max-w-xl" />
          </div>
          <SettingsLoadingBar className="h-8 w-36" />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[760px] border-t border-border">
            <SettingsLoadingBar className="h-[42px] w-full rounded-none" />
            {["first", "second", "third"].map((row) => (
              <div
                className="flex h-[68px] items-center gap-6 border-t border-border-soft px-3"
                key={row}
              >
                <SettingsLoadingBar className="h-4 w-48" />
                <SettingsLoadingBar className="h-4 w-32" />
                <SettingsLoadingBar className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </SettingsRouteLoading>
  );
}
