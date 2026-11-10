"use client";
import { Card } from "@/components/ui/Card";
import { useTranslations } from "next-intl";

function Bar({ className = "w-32" }: { className?: string }) {
  return <span className={`block h-3 max-w-full rounded bg-border ${className}`} />;
}

const pagePanels: Record<string, number[]> = {
  Worker: [9, 6],
  Checks: [14, 3],
  "Data sources": [4],
  Notifications: [4],
  Accounts: [5, 2],
  Settings: [2, 5],
  Audit: [5],
  "Sending today": [4, 3],
  Tasks: [4, 6],
  Subscriptions: [4, 4],
  "Analytics exclusions": [3, 3],
};

export function OssPageLoading({ view }: { view: string }) {
  const t = useTranslations("instanceAdmin");
  return (
    <>
      <span role="status" className="sr-only">
        {view === "Accounts"
          ? t("accounts.loading")
          : view === "Tasks"
            ? t("pages.loadingCases")
            : t("shell.refreshing")}
      </span>
      <div
        aria-hidden="true"
        aria-busy="true"
        className="grid min-w-0 gap-4 motion-safe:animate-pulse"
      >
        {view === "Status" ? (
          <>
            <Card size="lg">
              <Bar className="h-4 w-28" />
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Bar className="h-10 w-20" />
                <Bar className="h-10 w-20" />
              </div>
            </Card>
            <div className="flex flex-wrap gap-3">
              {[0, 1, 2, 3].map((item) => (
                <Bar key={item} className="h-8 w-32" />
              ))}
            </div>
            <Bar className="mt-2 h-4 w-36" />
            {[0, 1, 2].map((item) => (
              <Card key={item} size="lg">
                <Bar className="h-4 w-32" />
                <div className="mt-4 grid grid-cols-2 gap-6 lg:grid-cols-4">
                  {[0, 1, 2, 3].map((n) => (
                    <div key={n}>
                      <Bar className="w-28" />
                      <Bar className="mt-3 h-6 w-20" />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </>
        ) : (
          (pagePanels[view] ?? [4, 6]).map((count, index) => (
            <Card key={index} size="lg" className="min-w-0">
              <Bar className="h-5 w-40" />
              <Bar className="mt-2 w-72" />
              <div
                className={`mt-4 grid gap-3 ${view === "Audit" || view === "Tasks" || view === "Data sources" ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-4"}`}
              >
                {Array.from({ length: count }, (_, item) => (
                  <div key={item} className="grid gap-3 py-3">
                    <Bar className="w-20" />
                    <Bar
                      className={
                        view === "Audit" || view === "Tasks" || view === "Data sources"
                          ? "h-6 w-full"
                          : "h-6 w-14"
                      }
                    />
                  </div>
                ))}
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
