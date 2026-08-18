import { developerLoadingGeometryClassNames } from "@/components/settings/developers/developer-settings-layout";
import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { cn } from "@/lib/ui/cn";

const frames = [
  { className: developerLoadingGeometryClassNames.apiKeys, id: "api-keys" },
  { className: developerLoadingGeometryClassNames.deployWebhooks, id: "deploy-webhooks" },
] as const;

export function DevelopersCardsLoading() {
  return (
    <div className="max-w-[640px] space-y-3.5">
      {frames.map((frame) => (
        <section
          className={cn(
            settingsCardFrameClassName,
            "flex flex-col gap-4.5 p-[18px_20px]",
            frame.className,
          )}
          data-developer-loading-frame={frame.id}
          data-settings-loading-frame={frame.id}
          key={frame.id}
        >
          <div className="space-y-2">
            <SettingsLoadingBar className="h-4 w-32" />
            <SettingsLoadingBar className="h-3 w-full max-w-[480px]" />
          </div>
          <SettingsLoadingBar
            className={frame.id === "api-keys" ? "h-[142px] w-full" : "h-[156px] w-full"}
          />
          <div className="mt-auto flex justify-end gap-2.5">
            {frame.id === "api-keys" ? <SettingsLoadingBar className="h-8.5 w-28" /> : null}
            <SettingsLoadingBar className="h-8.5 w-28" />
          </div>
        </section>
      ))}
    </div>
  );
}

export function DevelopersLoading() {
  return (
    <SettingsRouteLoading activeSection="developers">
      <DevelopersCardsLoading />
    </SettingsRouteLoading>
  );
}
