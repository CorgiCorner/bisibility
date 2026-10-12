import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { cn } from "@/lib/ui/cn";

const frames = [
  { className: "min-h-[525px] sm:min-h-[386px]", id: "plan" },
  { className: "min-h-0", id: "provider-usage" },
] as const;

export function UsageCardsLoading({ planOnly = false }: { planOnly?: boolean }) {
  return (
    <div className="flex w-full max-w-[760px] flex-col gap-3.5">
      {frames
        .filter((frame) => !planOnly || frame.id === "plan")
        .map((frame) => (
          <section
            className={cn(settingsCardFrameClassName, frame.className)}
            data-settings-loading-frame={frame.id}
            key={frame.id}
          >
            <div className="space-y-2">
              <SettingsLoadingBar className="h-4 w-28" />
              <SettingsLoadingBar className="h-3 w-full max-w-[460px]" />
            </div>
            {frame.id === "plan" ? (
              <div className="mt-5 space-y-4">
                <SettingsLoadingBar className="h-6 w-40" />
                <SettingsLoadingBar className="h-[88px] w-full" />
                <SettingsLoadingBar className="h-[72px] w-full" />
              </div>
            ) : (
              // Mirrors the settled card: figure and meter, metrics, then connection rows.
              <div className="mt-6 space-y-6">
                <div className="space-y-3">
                  <SettingsLoadingBar className="h-3 w-24" />
                  <SettingsLoadingBar className="h-10 w-28" />
                  <SettingsLoadingBar className="h-2.5 w-full" />
                </div>
                <div className="grid grid-cols-2 gap-6 border-t border-border pt-5 sm:grid-cols-3">
                  {["paid", "requests", "projected"].map((metric) => (
                    <div className="space-y-2" key={metric}>
                      <SettingsLoadingBar className="h-3 w-20" />
                      <SettingsLoadingBar className="h-5 w-24" />
                    </div>
                  ))}
                </div>
                <div className="divide-y divide-border border-t border-border">
                  {["first", "second"].map((row) => (
                    <div className="flex items-center justify-between gap-4 py-4" key={row}>
                      <SettingsLoadingBar className="h-4 w-28" />
                      <SettingsLoadingBar className="h-1.5 w-24" />
                    </div>
                  ))}
                </div>
                <div
                  className="flex items-center gap-4 border-t border-border pt-4"
                  data-usage-loading-footer="provider-usage"
                >
                  <SettingsLoadingBar className="h-3 w-28" />
                  <SettingsLoadingBar className="h-3 w-32" />
                </div>
              </div>
            )}
          </section>
        ))}
    </div>
  );
}

export function BillingLoading() {
  return (
    <SettingsRouteLoading activeSection="billing">
      <UsageCardsLoading planOnly />
    </SettingsRouteLoading>
  );
}
