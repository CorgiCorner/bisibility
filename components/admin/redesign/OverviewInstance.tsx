"use client";
import { Badge, statusLabel } from "@/components/admin/AdminPrimitives";
import { Button } from "@/components/ui/Button";
import { useFormatter, useTranslations } from "next-intl";
import { useContext } from "react";
import type { OssAdminData } from "./OssAdminViews";
import { type PreviewDestination, PreviewNavigationContext } from "./PreviewNavigationContext";

export function OverviewInstance({
  operations,
}: {
  operations: NonNullable<OssAdminData["operations"]>;
}) {
  const format = useFormatter();
  const t = useTranslations("instanceAdmin");
  const navigate = useContext(PreviewNavigationContext);
  const { data, emailAllowance } = operations;
  const ready = data.availability.rankChecks;
  const items: {
    label: string;
    destination: PreviewDestination;
    status: string;
    value?: string;
  }[] = [
    {
      label: t("worker.title"),
      destination: "Worker",
      status: data.availability.worker ? data.worker.status : "unknown",
    },
    {
      label: t("dashboard.emailAllowance.title"),
      destination: "Sending today",
      status: emailAllowance?.status === "available" ? "ok" : "unknown",
    },
    {
      label: t("dashboard.rankChecks.statusLabel"),
      destination: "Checks",
      status: ready ? "ok" : "unknown",
      value: ready ? format.number(data.rank24h.scheduled) : t("values.unavailable"),
    },
    {
      label: t("dashboard.rankChecks.failures"),
      destination: "Checks",
      status: !ready ? "unknown" : data.rank24h.failed ? "failed" : "ok",
      value: ready ? format.number(data.rank24h.failed) : t("values.unavailable"),
    },
  ];
  return (
    <section data-testid="oss-status" className="grid min-w-0 gap-3" aria-label={t("shell.status")}>
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item) => (
          <Button
            key={item.label}
            aria-label={`${item.label}: ${item.value ?? statusLabel(item.status, t)}`}
            size="sm"
            variant="ghost"
            onClick={() => navigate(item.destination)}
          >
            <span className="text-fg-muted">{item.label}</span>
            <Badge status={item.status}>{item.value}</Badge>
          </Button>
        ))}
      </div>
    </section>
  );
}
