// Skeleton for /app/account/preferences. Mirrors the page: the Profile/Preferences/Security
// tab nav above the preferences form card (a grid of labelled fields plus a save action).

import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-bg-sunken", className)} />;
}

const tabKeys = ["profile", "preferences", "security"] as const;
const fieldKeys = ["theme", "density", "timezone", "date-format", "start-page", "digest"] as const;

export default function PreferencesLoading() {
  return (
    <PageContent aria-hidden className="flex flex-col gap-[22px]" variant="form">
      <div className="flex w-max items-center gap-0.5 rounded-[10px] border border-border-strong bg-bg-sunken p-[3px]">
        {tabKeys.map((key) => (
          <Bar className="h-8 w-[92px] rounded-lg" key={key} />
        ))}
      </div>

      <section className="space-y-[14px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <Bar className="h-4 w-[120px]" />
            <Bar className="h-3 w-[300px]" />
          </div>
          <Bar className="h-8 w-[60px] shrink-0" />
        </div>
        <div className="rounded-[14px] border border-border bg-bg-elev p-5">
          <div className="grid gap-[14px] sm:grid-cols-2">
            {fieldKeys.map((key) => (
              <div className="flex flex-col gap-1.5" key={key}>
                <Bar className="h-2.5 w-[110px]" />
                <Bar className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </PageContent>
  );
}
