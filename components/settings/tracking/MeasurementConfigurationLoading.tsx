import { SettingsLoadingBar as Bar } from "@/components/settings/shell/SettingsRouteLoading";
import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { Card } from "@/components/ui/Card";
export function MeasurementConfigurationLoading() {
  return (
    <>
      <section
        className={settingsCardFrameClassName}
        data-tracking-loading-frame="measurementPolicy"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Bar className="h-[21px] w-40" />
            <Bar className="h-10 w-full" />
          </div>
          <Bar className="h-9 w-24" />
        </div>
        <div className="mt-5">
          <Bar className="mb-4 h-5 w-full" />
          <div className="grid gap-4 sm:grid-cols-2">
            {["manual", "grace"].map((key) => (
              <div key={key}>
                <Bar className="mb-1.5 h-5 w-36" />
                <Bar className="h-10 w-full" />
                <Bar className="mt-1.5 h-10 w-full" />
              </div>
            ))}
          </div>
          <Bar className="mt-4 h-10 w-full" />
        </div>
      </section>
      <Card className="min-w-0" data-tracking-loading-frame="measurementSettings">
        <Bar className="h-6 w-44" />
        <Bar className="mt-2 h-10 w-full" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {["scope", "schedule"].map((key) => (
            <div className="space-y-1.5" key={key}>
              <Bar className="h-5 w-32" />
              <Bar className="h-9 w-full" />
            </div>
          ))}
        </div>
        <Bar className="mt-4 h-5 w-48" />
        <Bar className="mt-4 h-9 w-32" />
      </Card>
    </>
  );
}
