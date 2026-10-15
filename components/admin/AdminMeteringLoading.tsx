"use client";
import { useTranslations } from "next-intl";
import { AdminMeteringFrame } from "./AdminMeteringFrame";

function Bar({ className = "w-24" }: { className?: string }) {
  return <span className={`block h-3 rounded bg-border ${className}`} />;
}
function Table({ columns, rows = 3 }: { columns: number; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-card border border-border">
      <div className="overflow-x-auto">
        <div className="min-w-[52rem]">
          <div
            className="grid h-10 items-center border-b border-border bg-bg-sunken px-4"
            style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` }}
          >
            {Array.from({ length: columns }, (_, i) => (
              <Bar key={i} className="w-16" />
            ))}
          </div>
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              className="grid min-h-20 items-center border-b border-border-soft px-4 last:border-0"
              style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` }}
            >
              {Array.from({ length: columns }, (_, j) => (
                <Bar key={j} className="w-14" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
export function AdminMeteringLoading({ incidents = false }: { incidents?: boolean }) {
  const t = useTranslations("instanceAdmin");
  return (
    <AdminMeteringFrame incidents={incidents}>
      <div
        aria-busy="true"
        aria-hidden="true"
        className="grid min-w-0 gap-6 animate-pulse motion-reduce:animate-none"
      >
        {incidents ? (
          <>
            <div className="flex justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">{t("recovery.heading")}</h2>
                <p className="mt-1 text-xs">{t("recovery.description")}</p>
                <Bar className="mt-2 w-44" />
              </div>
              <span className="h-[34px] w-24 rounded-control border border-border-control" />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {(
                ["unfinished", "failed", "unconfirmed", "historical", "retainedResults"] as const
              ).map((key) => (
                <div key={key} className="rounded-xl border border-border bg-bg-elev p-4">
                  <p className="text-xs text-fg-muted">{t(`recovery.counts.${key}`)}</p>
                  <span className="mt-1 block h-7">
                    <Bar className="w-10" />
                  </span>
                </div>
              ))}
            </div>
            <div className="grid gap-3 rounded-card border border-border-soft bg-bg-sunken p-4 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i}>
                  <Bar className="w-36" />
                  <Bar className="mt-2 w-28" />
                </div>
              ))}
            </div>
            <Table columns={8} />
          </>
        ) : (
          <>
            <div className="grid gap-3 rounded-card border border-border bg-bg-elev p-4 sm:grid-cols-[12rem_minmax(14rem,24rem)]">
              {(["month", "project"] as const).map((key) => (
                <div key={key} className="grid gap-1.5">
                  <p className="text-xs font-medium text-fg-muted">{t(`metering.${key}`)}</p>
                  <span className="block h-[34px] rounded-control border border-border-control bg-bg" />
                </div>
              ))}
            </div>
            {(
              [
                { key: "usageHeading", cols: 9 },
                { key: "budgetsHeading", cols: 7 },
                { key: "exceptionsHeading", cols: 6 },
              ] as const
            ).map((section) => (
              <section key={section.key} className="grid min-w-0 gap-3">
                <h2 className="text-sm font-semibold">{t(`metering.${section.key}`)}</h2>
                {section.key === "usageHeading" && <Bar className="w-48" />}
                <Table columns={section.cols} />
              </section>
            ))}
          </>
        )}
      </div>
    </AdminMeteringFrame>
  );
}
