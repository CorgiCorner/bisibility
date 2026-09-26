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
}: Pick<MeteringAdminPage, "month" | "months" | "project"> & { projects: string[] }) {
  const router = useRouter(),
    pathname = usePathname(),
    t = useTranslations("instanceAdmin.metering");
  function select(nextMonth: string, nextProject: string) {
    const params = new URLSearchParams({ month: nextMonth });
    if (nextProject) params.set("project", nextProject);
    router.push(`${pathname}?${params}`);
  }
  return (
    <div className="flex flex-wrap gap-3">
      <MenuSelect
        ariaLabel={t("month")}
        value={month}
        options={[...new Set([month, ...months])].map((value) => ({ value, label: value }))}
        onChange={(value) => select(value, project ?? "")}
      />
      <MenuSelect
        ariaLabel={t("project")}
        value={project ?? ""}
        options={[
          { value: "", label: t("allProjects") },
          ...[...new Set([...(project ? [project] : []), ...projects])].map((value) => ({
            value,
            label: value,
          })),
        ]}
        onChange={(value) => select(month, value)}
        searchable
      />
    </div>
  );
}
