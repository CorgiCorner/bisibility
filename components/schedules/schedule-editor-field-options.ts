import { type AppLocale, intlLocale } from "@/i18n/config";
import { serpDepthValues } from "@/lib/serp/constants";
import type { useTranslations } from "next-intl";
import type {
  cronPreview,
  ScheduleEditorProjectDefaults,
  ScheduleEditorProvider,
} from "./ScheduleEditorModel";

type ScheduleTranslations = ReturnType<typeof useTranslations<"projectRuns.schedules">>;
type CronPreview = ReturnType<typeof cronPreview> | null;

/** The sentence under the cron field, in the viewer's own words. */
export function cronPreviewDetail(preview: CronPreview, t: ScheduleTranslations) {
  switch (preview?.detail) {
    case "invalidCron":
      return t("editor.invalidCron");
    case "invalidTimeZone":
      return t("editor.invalidTimeZone");
    case "everyWeekday":
      return t("editor.everyWeekday");
    case "custom":
      return t("editor.customPreview");
    default:
      return null;
  }
}

/** The next runs, formatted in the viewer's locale and the schedule's own time zone. */
export function cronPreviewRuns(preview: CronPreview, locale: AppLocale) {
  if (!preview?.runs) return null;
  const formatter = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: preview.timeZone,
    weekday: "short",
  });
  return preview.runs.map((run) => formatter.format(new Date(run)));
}

export function providerSelectOptions(
  t: ScheduleTranslations,
  projectDefaults: ScheduleEditorProjectDefaults,
  connectedProviders: readonly ScheduleEditorProvider[],
) {
  return [
    {
      label: projectDefaults.provider
        ? t("editor.projectDefault", { label: projectDefaults.provider.label })
        : t("editor.projectDefaultPlain"),
      value: "project",
    },
    ...connectedProviders.map(({ label, value }) => ({
      label: t("editor.always", { label }),
      value,
    })),
  ];
}

export function depthSelectOptions(
  t: ScheduleTranslations,
  projectDefaults: ScheduleEditorProjectDefaults,
) {
  return [
    {
      label: t("editor.projectDefault", {
        label: t("editor.topDepth", { depth: projectDefaults.serpDepth }),
      }),
      value: "project",
    },
    ...serpDepthValues.map((depth) => ({
      label: t("editor.always", { label: t("editor.topDepth", { depth }) }),
      value: String(depth),
    })),
  ];
}
