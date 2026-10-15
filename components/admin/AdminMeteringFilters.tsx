"use client";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { MeteringAdminPage } from "@/lib/metering/admin-types";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
export function AdminMeteringFilters({
  month,
  months,
  project,
  projects,
  projectNames,
}: Pick<MeteringAdminPage, "month" | "months" | "project"> & {
  projects: string[];
  projectNames?: Record<string, string>;
}) {
  const router = useRouter(),
    pathname = usePathname(),
    t = useTranslations("instanceAdmin.metering");
  function select(nextMonth: string, nextProject: string) {
    const params = new URLSearchParams({ month: nextMonth });
    if (nextProject) params.set("project", nextProject);
    router.push(`${pathname}?${params}`);
  }
  return (
    <div className="grid gap-3 rounded-card border border-border bg-bg-elev p-4 sm:grid-cols-[12rem_minmax(14rem,24rem)]">
      <div className="grid min-w-0 gap-1.5">
        <span className="text-xs font-medium text-fg-muted">{t("month")}</span>
        <MenuSelect
          ariaLabel={t("month")}
          value={month}
          options={[...new Set([month, ...months])].map((value) => ({ value, label: value }))}
          onChange={(value) => select(value, project ?? "")}
        />
      </div>
      <div className="grid min-w-0 gap-1.5">
        <span className="text-xs font-medium text-fg-muted">{t("project")}</span>
        <MenuSelect
          ariaLabel={t("project")}
          value={project ?? ""}
          options={[
            { value: "", label: t("allProjects") },
            ...[...new Set([...(project ? [project] : []), ...projects])].map((value) => ({
              value,
              label: projectNames?.[value] ?? value,
            })),
          ]}
          onChange={(value) => select(month, value)}
          searchable
        />
      </div>
    </div>
  );
}
