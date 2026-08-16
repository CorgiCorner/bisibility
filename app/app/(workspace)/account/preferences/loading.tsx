import { AccountLoadingBar, AccountShellLoading } from "@/components/account/AccountShellLoading";

const fieldKeys = ["theme", "density", "timezone", "date-format", "start-page", "digest"] as const;

export default function PreferencesLoading() {
  return (
    <AccountShellLoading activeSection="preferences">
      <div className="flex flex-col gap-[22px]">
        <section className="space-y-[14px]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              <AccountLoadingBar className="h-4 w-[120px]" />
              <AccountLoadingBar className="h-3 w-[300px]" />
            </div>
            <AccountLoadingBar className="h-8 w-[60px] shrink-0" />
          </div>
          <div className="rounded-[14px] border border-border bg-bg-elev p-5">
            <div className="grid gap-[14px] sm:grid-cols-2">
              {fieldKeys.map((key) => (
                <div className="flex flex-col gap-1.5" key={key}>
                  <AccountLoadingBar className="h-2.5 w-[110px]" />
                  <AccountLoadingBar className="h-10 w-full" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AccountShellLoading>
  );
}
