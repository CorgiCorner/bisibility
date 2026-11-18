import en from "@/messages/core/en/project-runs-schedules.json";
import es from "@/messages/core/es-ES/project-runs-schedules.json";
import ja from "@/messages/core/ja/project-runs-schedules.json";
import pl from "@/messages/core/pl/project-runs-schedules.json";

const catalogs = { en, "es-ES": es, ja, pl } as const;
export type ScheduleMessageKey = keyof typeof en.projectRuns.schedules.errors;

/** English is the server message. The same keys exist in every core locale. */
export function scheduleMessage(
  key: ScheduleMessageKey,
  locale = "en",
  values?: Record<string, string>,
) {
  const catalog = catalogs[locale as keyof typeof catalogs] ?? catalogs.en;
  let text: string = catalog.projectRuns.schedules.errors[key];
  if (values) {
    for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, value);
  }
  return text;
}
