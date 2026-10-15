import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className: string }>) {
  return (
    <span
      className={cn("block rounded-control bg-bg-sunken motion-safe:animate-pulse", className)}
    />
  );
}

function Field({ help = false }: Readonly<{ help?: boolean }>) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Bar className="h-4 w-24 max-w-full" />
      <Bar className="h-10 w-full" />
      {help ? <Bar className="h-8 w-full" /> : null}
    </div>
  );
}

export function ScheduleEditorLoadingContent() {
  return (
    <div aria-busy="true" aria-hidden className="grid gap-[18px]">
      <div className="grid min-w-0 gap-3.5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Card className="min-w-0 overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3.5">
            <Bar className="h-5 w-24" />
          </div>
          <div className="flex flex-col gap-3.5 p-4">
            <Field />
            <div className="grid gap-1.5">
              <Bar className="h-4 w-24" />
              <Bar className="h-8 w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <Field help />
            </div>
            <Field />
            <div className="flex flex-wrap gap-3.5">
              {["window", "depth", "provider"].map((field) => (
                <div className="min-w-0 flex-1 basis-[200px]" key={field}>
                  <Field help />
                </div>
              ))}
            </div>
            <div className="flex items-start gap-3">
              <Bar className="h-[22px] w-[38px] shrink-0 rounded-full" />
              <div className="grid min-w-0 flex-1 gap-1.5">
                <Bar className="h-4 w-32 max-w-full" />
                <Bar className="h-8 w-full" />
              </div>
            </div>
          </div>
        </Card>
        <Card className="min-w-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5">
            <div className="grid gap-1.5">
              <Bar className="h-5 w-36 max-w-full" />
              <Bar className="h-4 w-20" />
            </div>
            <Bar className="h-8 w-28 max-w-full" />
          </div>
          <div className="px-4 py-4">
            <Bar className="h-5 w-full max-w-72" />
          </div>
        </Card>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <Bar className="h-9 w-20" />
        <Bar className="h-9 w-32" />
      </div>
    </div>
  );
}
