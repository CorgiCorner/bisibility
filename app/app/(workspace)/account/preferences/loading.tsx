import { AccountLoadingBar, AccountShellLoading } from "@/components/account/AccountShellLoading";

// Mirrors the loaded PreferencesForm: a Preferences section header, a full-width Theme
// segmented row, a two-column grid of Date format and Default landing page, and a full-width
// Default table density segmented row. Keeping the row count and layout honest prevents the
// skeleton from announcing fields the form no longer renders.
export default function PreferencesLoading() {
  return (
    <AccountShellLoading activeSection="preferences">
      <div className="flex flex-col gap-5.5">
        <section className="space-y-3.5">
          <div className="flex min-w-0 flex-col gap-2">
            <AccountLoadingBar className="h-4 w-[120px]" />
            <AccountLoadingBar className="h-3 w-[300px]" />
          </div>
          <div className="rounded-[14px] border border-border bg-bg-elev p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3.5">
                <div className="flex min-w-0 flex-col gap-1">
                  <AccountLoadingBar className="h-3.5 w-[56px]" />
                  <AccountLoadingBar className="h-3 w-[200px]" />
                </div>
                <AccountLoadingBar className="h-8 w-[150px] shrink-0" />
              </div>
              <div className="grid gap-3.5 border-t border-border-soft pt-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <AccountLoadingBar className="h-2.5 w-[80px]" />
                  <AccountLoadingBar className="h-10 w-full" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <AccountLoadingBar className="h-2.5 w-[140px]" />
                  <AccountLoadingBar className="h-10 w-full" />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-border-soft pt-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <AccountLoadingBar className="h-3.5 w-[160px]" />
                  <AccountLoadingBar className="h-3 w-[240px]" />
                </div>
                <AccountLoadingBar className="h-8 w-[120px] shrink-0" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </AccountShellLoading>
  );
}
