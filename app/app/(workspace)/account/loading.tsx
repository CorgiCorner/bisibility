// Skeleton for /app/account. Mirrors the page: the Profile/Preferences/Security tab nav,
// the profile card (avatar row + form fields), the connected-accounts row list, and the
// red-bordered delete-account zone.

import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-bg-sunken", className)} />;
}

const tabKeys = ["profile", "preferences", "security"] as const;
const profileFieldKeys = ["name", "email"] as const;
const accountKeys = ["github", "google"] as const;

export default function AccountLoading() {
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
            <Bar className="h-4 w-[90px]" />
            <Bar className="h-3 w-[280px]" />
          </div>
          <Bar className="h-8 w-[60px] shrink-0" />
        </div>
        <div className="rounded-[14px] border border-border bg-bg-elev p-5">
          <div className="flex items-center gap-[14px]">
            <Bar className="h-[54px] w-[54px] shrink-0 rounded-[14px]" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Bar className="h-4 w-[150px]" />
              <Bar className="h-3 w-[200px]" />
            </div>
            <Bar className="h-8 w-[72px] shrink-0" />
          </div>
          <div className="mt-[18px] grid gap-[14px] sm:grid-cols-2">
            {profileFieldKeys.map((key) => (
              <div className="flex flex-col gap-1.5" key={key}>
                <Bar className="h-2.5 w-[100px]" />
                <Bar className="h-10 w-full" />
              </div>
            ))}
            <div className="flex flex-col gap-1.5 sm:col-span-2 sm:max-w-[50%]">
              <Bar className="h-2.5 w-[70px]" />
              <Bar className="h-10 w-full" />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-[14px]">
        <div className="flex min-w-0 flex-col gap-2">
          <Bar className="h-4 w-[170px]" />
          <Bar className="h-3 w-[320px]" />
        </div>
        <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
          {accountKeys.map((key) => (
            <div
              className="flex items-center gap-[13px] border-b border-border-soft px-[18px] py-[14px] last:border-b-0"
              key={key}
            >
              <Bar className="h-[34px] w-[34px] shrink-0 rounded-[9px]" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Bar className="h-3.5 w-[90px]" />
                <Bar className="h-3 w-[180px]" />
              </div>
              <Bar className="h-8 w-[88px] shrink-0" />
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-[14px] border border-red bg-bg-elev px-5 py-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-[14px]">
          <div className="flex min-w-0 flex-col gap-2">
            <Bar className="h-4 w-[110px]" />
            <Bar className="h-3 w-[300px]" />
          </div>
          <Bar className="h-9 w-[140px] shrink-0" />
        </div>
      </div>
    </PageContent>
  );
}
