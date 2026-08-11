import { advancedLoadingCardGeometryClassNames } from "@/components/settings/advanced/advanced-settings-layout";
import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { cn } from "@/lib/ui/cn";

function Frame({
  children,
  className,
  id,
}: Readonly<{ children: React.ReactNode; className: string; id: string }>) {
  return (
    <section
      className={cn(
        settingsCardFrameClassName,
        "flex flex-col gap-[18px] p-[18px_20px]",
        className,
      )}
      data-advanced-loading-frame={id}
      data-settings-loading-frame={id}
    >
      <div className="space-y-2">
        <SettingsLoadingBar className="h-4 w-36" />
        <SettingsLoadingBar className="h-3 w-full max-w-[520px]" />
      </div>
      {children}
    </section>
  );
}

function AuditFrame() {
  return (
    <Frame className={advancedLoadingCardGeometryClassNames.audit} id="audit">
      <div className="divide-y divide-border-soft overflow-hidden rounded-[11px] border border-border">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            className="grid grid-cols-[34px_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[34px_minmax(0,1fr)_auto] sm:items-center"
            key={index}
          >
            <SettingsLoadingBar className="row-span-2 h-[34px] w-[34px] sm:row-span-1" />
            <div className="space-y-1.5">
              <SettingsLoadingBar className="h-3 w-28" />
              <SettingsLoadingBar className="h-2.5 w-44 max-w-full" />
            </div>
            <SettingsLoadingBar className="col-start-2 h-2.5 w-24 sm:col-start-3" />
          </div>
        ))}
      </div>
      <div className="mt-auto flex justify-end border-border-soft border-t pt-4">
        <SettingsLoadingBar className="h-[34px] w-28" />
      </div>
    </Frame>
  );
}

function BackupFrame() {
  return (
    <Frame className={advancedLoadingCardGeometryClassNames.backup} id="backup">
      <div className="flex items-center justify-between gap-3 rounded-[11px] border border-border px-3.5 py-3">
        <div className="flex-1 space-y-2">
          <SettingsLoadingBar className="h-3 w-28" />
          <SettingsLoadingBar className="h-2.5 w-64 max-w-full" />
        </div>
        <SettingsLoadingBar className="h-5 w-24" />
      </div>
      <div className="mt-auto flex justify-end border-border-soft border-t pt-4">
        <SettingsLoadingBar className="h-[34px] w-32" />
      </div>
    </Frame>
  );
}

function MigrationFrame() {
  return (
    <Frame className={advancedLoadingCardGeometryClassNames.migration} id="hosted-move">
      <div className="divide-y divide-border-soft overflow-hidden rounded-[11px] border border-border">
        <div className="flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="flex-1 space-y-2">
            <SettingsLoadingBar className="h-3 w-28" />
            <SettingsLoadingBar className="h-2.5 w-52 max-w-full" />
          </div>
          <SettingsLoadingBar className="h-5 w-16" />
        </div>
        <div className="px-3.5 py-3">
          <SettingsLoadingBar className="h-2.5 w-full" />
          <SettingsLoadingBar className="mt-2 h-2.5 w-4/5" />
        </div>
      </div>
      <div className="mt-auto flex justify-end border-border-soft border-t pt-4">
        <SettingsLoadingBar className="h-[34px] w-32" />
      </div>
    </Frame>
  );
}

function DangerFrame() {
  return (
    <Frame className={advancedLoadingCardGeometryClassNames.danger} id="danger">
      <div className="mt-auto flex justify-end border-border-soft border-t pt-4">
        <SettingsLoadingBar className="h-9 w-28" />
      </div>
    </Frame>
  );
}

export function AdvancedSettingsContentLoading() {
  return (
    <div className="flex max-w-[760px] flex-col gap-[14px]" data-advanced-settings-loading="">
      <AuditFrame />
      <BackupFrame />
      <MigrationFrame />
      <DangerFrame />
    </div>
  );
}

export function AdvancedSettingsLoading() {
  return (
    <SettingsRouteLoading activeSection="advanced">
      <AdvancedSettingsContentLoading />
    </SettingsRouteLoading>
  );
}
