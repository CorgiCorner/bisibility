import type { DashboardTranslator } from "@/lib/dashboard-layout/types";
import type { useTranslations } from "next-intl";

export function dashboardTranslator(
  t: ReturnType<typeof useTranslations<"shared.dashboardLayout">>,
): DashboardTranslator {
  return (key, values) => {
    const required = (name: string) => {
      const value = values?.[name];
      if (value === undefined)
        throw new Error(`Missing dashboard translation value: ${key}.${name}`);
      return String(value);
    };
    switch (key) {
      case "show":
      case "hide":
      case "moveUp":
      case "moveDown":
      case "reorder":
      case "widgetHelp":
      case "span":
        return t(key, { title: required("title") });
      case "moved":
        return t(key, { title: required("title"), position: required("position") });
      default:
        return t(key);
    }
  };
}
