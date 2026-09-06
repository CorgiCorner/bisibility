import { cn } from "@/lib/ui/cn";
import type { ComponentPropsWithoutRef } from "react";

function Bar({ className, ...props }: Readonly<ComponentPropsWithoutRef<"div">>) {
  return <div className={cn("animate-pulse rounded-control bg-bg-sunken", className)} {...props} />;
}

function TokenCardLoading() {
  return (
    <div
      className="mt-7 overflow-hidden rounded-card border border-border bg-bg-elev"
      data-cloud-import-loading-frame="token-card"
    >
      <div className="flex items-center gap-[13px] border-border border-b p-[20px_22px]">
        <Bar className="h-[42px] w-[42px] flex-none rounded-control" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Bar className="h-[15px] w-[140px]" />
          <Bar className="h-3 w-[78%] max-w-[360px]" />
        </div>
      </div>
      <div className="flex flex-col items-center px-4 pt-3.5 pb-1.5">
        <Bar className="h-[50px] w-[50px] rounded-card" />
        <Bar className="mt-3.5 h-[15px] w-[148px]" />
        <Bar className="mt-1.5 h-[13px] w-[280px] max-w-full" />
        <Bar className="mt-1.5 h-[13px] w-[220px] max-w-[80%]" />
        <Bar className="mt-4.5 h-[42px] w-[210px] rounded-control" />
      </div>
      <div className="flex items-start gap-[9px] border-border border-t bg-bg-sunken px-[22px] py-3.5">
        <Bar className="mt-0.5 h-3.5 w-3.5 flex-none rounded-control" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Bar className="h-3 w-full" />
          <Bar className="h-3 w-[70%]" />
        </div>
      </div>
    </div>
  );
}

export function CloudImportSettingsLoading() {
  return (
    <div data-cloud-import-loading="settings">
      <Bar className="mt-7 h-3 w-[72px]" data-cloud-import-loading-frame="back" />
      <section className="mt-1">
        <TokenCardLoading />
      </section>
    </div>
  );
}
