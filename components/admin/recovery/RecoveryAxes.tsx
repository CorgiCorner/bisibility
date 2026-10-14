"use client";
import type { RecoveryCase } from "@/lib/metering/recovery/contract";
import { useTranslations } from "next-intl";
export function RecoveryAxes({ row }: { row: RecoveryCase }) {
  const t = useTranslations("instanceAdmin.recovery");
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {(["send", "work", "accounting"] as const).map((axis) => (
        <div key={axis} className="rounded-xl border border-border bg-bg p-3">
          <dt className="text-xs text-fg-muted">{t(axis)}</dt>
          <dd className="mt-1 text-sm font-semibold">{t(`states.${row[axis]}`)}</dd>
        </div>
      ))}
    </dl>
  );
}
