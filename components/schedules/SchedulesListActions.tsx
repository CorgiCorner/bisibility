"use client";
import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Tooltip } from "@/components/ui/Tooltip";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type AiSchedulesController, aiScheduleHref } from "./ai-schedule-rows";

export function SchedulesListActions({
  ai,
  canUpdate,
  projectRef,
  status,
}: Readonly<{
  ai?: AiSchedulesController;
  canUpdate: boolean;
  projectRef: string;
  status: "current" | "archived";
}>) {
  const router = useRouter();
  const t = useTranslations("projectRuns.schedules");
  const aiCanWrite = ai?.canWrite ?? false;
  return (
    <>
      <MenuSelect
        ariaLabel={t("scheduleStatus")}
        leadingLabel={t("status")}
        value={status}
        options={[
          { label: t("current"), value: "current" },
          { label: t("archived"), value: "archived" },
        ]}
        onChange={(value) =>
          router.push(
            `${projectSchedulesPath(projectRef)}${value === "archived" ? "?status=archived" : ""}`,
          )
        }
      />
      {canUpdate ? (
        <Button href={projectSchedulesPath(projectRef, "new")} size="sm" variant="secondary">
          {t("newSchedule")}
        </Button>
      ) : null}
      {aiCanWrite ? (
        <Tooltip content={t("ai.addPromptFirst")} disabled={ai?.activePromptCount !== 0}>
          <span className="inline-flex" tabIndex={ai?.activePromptCount === 0 ? 0 : undefined}>
            <Button
              href={aiScheduleHref(projectRef, "new")}
              disabled={ai?.activePromptCount === 0}
              size="sm"
              variant="secondary"
            >
              {t("ai.newSchedule")}
            </Button>
          </span>
        </Tooltip>
      ) : null}
    </>
  );
}
