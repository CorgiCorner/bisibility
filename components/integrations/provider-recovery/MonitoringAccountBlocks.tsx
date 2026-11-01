"use client";

import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useTranslations } from "next-intl";

export type MonitoringAccountBlock = { connectionId: string; provider: string; deferred: number };
export function MonitoringAccountBlocks({
  blocks,
  projectRef,
}: {
  blocks: MonitoringAccountBlock[];
  projectRef: string;
}) {
  const t = useTranslations("projectRankTracker.checks");
  if (!blocks.length) return null;
  return (
    <section
      className="rounded-card border border-yellow/35 bg-yellow/10 px-4 py-3"
      aria-label={t("monitoringTitle")}
    >
      <h2 className="m-0 text-[13px] font-semibold">{t("monitoringTitle")}</h2>
      <ul className="mb-0 mt-2 space-y-1 pl-4 text-[12px] text-fg-muted">
        {blocks.map((block) => (
          <li key={block.connectionId}>
            {t("monitoringItem", { provider: block.provider, count: block.deferred })}
          </li>
        ))}
      </ul>
      <Link
        className="mt-2 inline-block text-[12px] underline"
        href={appPath(projectRef, "providers")}
      >
        {t("monitoringAction")}
      </Link>
    </section>
  );
}
