// Skeleton for /app/settings. Mirrors the stacked SettingsSection layout: each section is
// a header (title + description + save action) above a card holding a grid of form fields.
// Ends with the red-bordered danger zone.

import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-bg-sunken", className)} />;
}

function Field({ className }: Readonly<{ className?: string }>) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Bar className="h-2.5 w-[90px]" />
      <Bar className="h-10 w-full" />
    </div>
  );
}

const sections = [
  { key: "details", fields: ["d1", "d2", "d3", "d4"], action: true },
  { key: "defaults", fields: ["df1", "df2", "df3", "df4"], action: true },
  { key: "apikeys", fields: ["k1", "k2", "k3"], action: true },
  { key: "notifications", fields: ["n1", "n2", "n3"], action: false },
] as const;

export default function SettingsLoading() {
  return (
    <PageContent aria-hidden className="flex flex-col gap-[30px]" variant="form">
      {sections.map((section) => (
        <section className="space-y-[14px]" key={section.key}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              <Bar className="h-4 w-[170px]" />
              <Bar className="h-3 w-[260px]" />
            </div>
            {section.action ? <Bar className="h-8 w-[64px] shrink-0" /> : null}
          </div>
          <div className="rounded-2xl border border-border bg-bg-elev p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {section.fields.map((key) => (
                <Field key={key} />
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="space-y-[14px]">
        <div className="flex min-w-0 flex-col gap-2">
          <Bar className="h-4 w-[110px]" />
          <Bar className="h-3 w-[300px]" />
        </div>
        <div className="rounded-2xl border border-red bg-bg-elev p-5">
          <div className="flex flex-wrap items-center justify-between gap-[14px]">
            <Bar className="h-3.5 w-[320px]" />
            <Bar className="h-9 w-[150px] shrink-0" />
          </div>
        </div>
      </section>
    </PageContent>
  );
}
