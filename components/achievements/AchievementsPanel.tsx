"use client";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { AchievementView } from "@/lib/achievements/schema";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AchievementCard } from "./AchievementCard";
import { AchievementSettings } from "./AchievementSettings";
export function AchievementsPanel({ view }: { view: AchievementView }) {
  const t = useTranslations("account.achievements"),
    router = useRouter();
  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="m-0 text-[20px] font-semibold leading-7">{t("title")}</h1>
          <InfoTooltip text={`${t("criteria")} ${t("help", { zone: view.timeZone })}`} />
        </div>
        <p className="mb-0 mt-2 text-[13px] leading-6 text-fg-muted">{t("intro")}</p>
      </header>
      {!view.enabled ? <p className="text-[13px] text-fg-muted">{t("disabled")}</p> : null}
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        {(["presence", "practice"] as const).map((kind) => (
          <AchievementCard key={kind} view={view} kind={kind} onRefresh={() => router.refresh()} />
        ))}
      </div>
      <AchievementSettings key={view.revision} view={view} onRefresh={() => router.refresh()} />
    </div>
  );
}
