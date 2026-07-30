// Skeleton for /app/account/security. Mirrors the page: the Profile/Preferences/Security
// tab nav, the security-factors card rows, and the active-sessions list with its
// sign-out-everywhere action.

import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-bg-sunken", className)} />;
}

const tabKeys = ["profile", "preferences", "security"] as const;
const factorKeys = ["password", "two-factor", "passkeys"] as const;
const sessionKeys = ["current", "laptop", "phone"] as const;

export default function SecurityLoading() {
  return (
    <PageContent aria-hidden className="flex flex-col gap-[22px]" variant="form">
      <div className="flex w-max items-center gap-0.5 rounded-[10px] border border-border-strong bg-bg-sunken p-[3px]">
        {tabKeys.map((key) => (
          <Bar className="h-8 w-[92px] rounded-lg" key={key} />
        ))}
      </div>

      <section className="space-y-[14px]">
        <div className="flex min-w-0 flex-col gap-2">
          <Bar className="h-4 w-[130px]" />
          <Bar className="h-3 w-[310px]" />
        </div>
        <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
          {factorKeys.map((key) => (
            <div
              className="flex items-center gap-[13px] border-b border-border-soft px-[18px] py-[14px] last:border-b-0"
              key={key}
            >
              <Bar className="h-[34px] w-[34px] shrink-0 rounded-[9px]" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Bar className="h-3.5 w-[110px]" />
                <Bar className="h-3 w-[220px]" />
              </div>
              <Bar className="h-8 w-[88px] shrink-0" />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-[14px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <Bar className="h-4 w-[140px]" />
            <Bar className="h-3 w-[290px]" />
          </div>
          <Bar className="h-8 w-[150px] shrink-0" />
        </div>
        <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
          {sessionKeys.map((key) => (
            <div
              className="flex items-center gap-[13px] border-b border-border-soft px-[18px] py-[14px] last:border-b-0"
              key={key}
            >
              <Bar className="h-[34px] w-[34px] shrink-0 rounded-[9px]" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Bar className="h-3.5 w-[160px]" />
                <Bar className="h-3 w-[240px]" />
              </div>
              <Bar className="h-8 w-[80px] shrink-0" />
            </div>
          ))}
        </div>
      </section>
    </PageContent>
  );
}
