import { AccountLoadingBar, AccountShellLoading } from "@/components/account/AccountShellLoading";
import { Card } from "@/components/ui/Card";
export function AchievementsLoading() {
  return (
    <AccountShellLoading activeSection="activity">
      <div className="space-y-5">
        <header className="space-y-3">
          <AccountLoadingBar className="h-7 w-44" />
          <AccountLoadingBar className="h-5 w-64" />
        </header>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i} className="min-w-0 space-y-6 p-5 sm:p-6">
              <div className="flex justify-between gap-3">
                <div className="flex-1 space-y-3">
                  <AccountLoadingBar className="h-6 w-36" />
                  <AccountLoadingBar className="h-10 w-full" />
                  <AccountLoadingBar className="h-9 w-24" />
                </div>
                <AccountLoadingBar className="h-24 w-24" />
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                  <AccountLoadingBar key={day} className="h-24 w-full" />
                ))}
              </div>
              <div className="flex justify-between">
                <AccountLoadingBar className="h-4 w-20" />
                <AccountLoadingBar className="h-4 w-24" />
              </div>
            </Card>
          ))}
        </div>
        <Card className="space-y-4 p-5">
          <AccountLoadingBar className="h-5 w-36" />
          <div className="grid gap-2 sm:grid-cols-2">
            {[0, 1, 2].map((i) => (
              <AccountLoadingBar key={i} className="h-10 w-full" />
            ))}
          </div>
          <AccountLoadingBar className="h-10 w-full max-w-md" />
          <AccountLoadingBar className="h-9 w-20" />
        </Card>
      </div>
    </AccountShellLoading>
  );
}
