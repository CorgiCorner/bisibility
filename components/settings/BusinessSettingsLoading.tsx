import {
  SettingsLoadingBar as Bar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import { Card } from "@/components/ui/Card";
export function BusinessSettingsLoading({
  view = "locations",
}: Readonly<{ view?: "locations" | "monitors" | "monitor" }>) {
  return (
    <SettingsRouteLoading activeSection="business-locations">
      <div className="space-y-5" data-business-settings-loading={view}>
        {view === "locations" ? (
          <Bar className="mb-5 h-5 w-36" />
        ) : view === "monitor" ? (
          <Bar className="h-5 w-40" />
        ) : null}
        {view !== "locations" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Bar className="h-7 w-52" />
              <Bar className="h-9 w-28" />
            </div>
            {view === "monitors" ? (
              <>
                <Bar className="h-5 w-full" />
                <div className="flex gap-4">
                  <Bar className="h-5 w-32" />
                  <Bar className="h-5 w-36" />
                </div>
                <Bar className="h-9 w-48" />
              </>
            ) : null}
          </>
        ) : null}
        <Card className={view === "monitor" ? "space-y-3" : "min-w-0"}>
          {view === "monitor" ? (
            <>
              <Bar className="h-5 w-40" />
              <Bar className="h-5 w-full" />
              <Bar className="h-5 w-2/3" />
              <Bar className="h-5 w-1/2" />
              <div className="flex flex-wrap gap-4">
                <Bar className="h-5 w-32" />
                <Bar className="h-5 w-36" />
              </div>
            </>
          ) : (
            <>
              {view === "locations" ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Bar className="h-6 w-44" />
                    <Bar className="h-9 w-28" />
                  </div>
                  <Bar className="mt-3 h-9 w-44" />
                </>
              ) : null}
              <div className="mt-3 divide-y divide-border border-t border-border">
                {["one", "two", "three"].map((key) => (
                  <div
                    key={key}
                    className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <Bar className="h-6 w-40" />
                      <Bar className="h-5 w-52" />
                      <Bar className="h-4 w-36" />
                    </div>
                    <Bar className="h-8 w-24" />
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
        {view !== "monitors" ? (
          <Card className="space-y-3">
            <Bar className="h-6 w-44" />
            <Bar className="h-5 w-full" />
            <div className="flex flex-wrap gap-2">
              <Bar className="h-9 w-40" />
              <Bar className="h-9 w-52" />
            </div>
          </Card>
        ) : null}
        {view === "monitor" ? (
          <Card className="space-y-3">
            <Bar className="h-6 w-44" />
            <Bar className="h-5 w-full" />
            <Bar className="h-9 w-40" />
          </Card>
        ) : null}
      </div>
    </SettingsRouteLoading>
  );
}
