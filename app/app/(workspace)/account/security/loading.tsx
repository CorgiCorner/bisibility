import { AccountLoadingBar, AccountShellLoading } from "@/components/account/AccountShellLoading";

const factorKeys = ["password", "two-factor", "passkeys"] as const;
const sessionKeys = ["current", "laptop", "phone"] as const;

export default function SecurityLoading() {
  return (
    <AccountShellLoading activeSection="security">
      <div className="flex flex-col gap-[22px]">
        <section className="space-y-[14px]">
          <div className="flex min-w-0 flex-col gap-2">
            <AccountLoadingBar className="h-4 w-[130px]" />
            <AccountLoadingBar className="h-3 w-[310px]" />
          </div>
          <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
            {factorKeys.map((key) => (
              <div
                className="flex items-center gap-[13px] border-b border-border-soft px-[18px] py-[14px] last:border-b-0"
                key={key}
              >
                <AccountLoadingBar className="h-[34px] w-[34px] shrink-0 rounded-[9px]" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <AccountLoadingBar className="h-3.5 w-[110px]" />
                  <AccountLoadingBar className="h-3 w-[220px]" />
                </div>
                <AccountLoadingBar className="h-8 w-[88px] shrink-0" />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-[14px]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              <AccountLoadingBar className="h-4 w-[140px]" />
              <AccountLoadingBar className="h-3 w-[290px]" />
            </div>
            <AccountLoadingBar className="h-8 w-[150px] shrink-0" />
          </div>
          <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
            {sessionKeys.map((key) => (
              <div
                className="flex items-center gap-[13px] border-b border-border-soft px-[18px] py-[14px] last:border-b-0"
                key={key}
              >
                <AccountLoadingBar className="h-[34px] w-[34px] shrink-0 rounded-[9px]" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <AccountLoadingBar className="h-3.5 w-[160px]" />
                  <AccountLoadingBar className="h-3 w-[240px]" />
                </div>
                <AccountLoadingBar className="h-8 w-[80px] shrink-0" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </AccountShellLoading>
  );
}
