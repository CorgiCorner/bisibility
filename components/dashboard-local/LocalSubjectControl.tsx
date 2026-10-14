"use client";

import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { LocalDashboardContext } from "@/lib/dashboard-local/model";
import { saveDashboardLocalSelection } from "@/lib/project-surface-preferences/dashboard-actions";
import type { DashboardSurfacePreference } from "@/lib/project-surface-preferences/dashboard-model";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

export function LocalSubjectControl({
  local,
  preference,
  showStateDescription = true,
}: {
  local: LocalDashboardContext;
  preference: DashboardSurfacePreference;
  showStateDescription?: boolean;
}) {
  const t = useTranslations("projectDashboard.localReport");
  const router = useRouter(),
    pathname = usePathname(),
    search = useSearchParams();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = local.selection ? JSON.stringify(local.selection) : "";
  function navigate(value: string) {
    const params = new URLSearchParams(search.toString());
    params.set("dashboardView", "local");
    // A present empty value deliberately clears this URL selection instead of reviving a default.
    params.set("dashboardLocalSubject", value);
    router.replace(`${pathname}?${params}`);
  }
  function save(clear: boolean) {
    startTransition(async () => {
      try {
        const result = await saveDashboardLocalSelection({
          projectId: preference.projectId,
          expectedRevision: preference.revision,
          selection: clear ? null : local.selection,
        });
        if (!result.ok) {
          setMessage(t(result.error.status === 409 ? "conflict" : "saveError"));
          return;
        }
        setMessage(t(clear ? "cleared" : "saved"));
        if (clear) navigate("");
        router.refresh();
      } catch {
        setMessage(t("saveError"));
      }
    });
  }
  return (
    <section aria-label={t("selection")} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <MenuSelect
          ariaLabel={t("selection")}
          value={selected}
          disabled={pending}
          options={[
            { value: "", label: t("choose") },
            ...local.choices.map((choice) => ({
              value: JSON.stringify(choice.selection),
              label: choice.label,
            })),
          ]}
          onChange={navigate}
          searchable
        />
        {local.selection ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !local.selection}
            onClick={() => save(false)}
          >
            {t("remember")}
          </Button>
        ) : null}
        {preference.presentation.localSelection ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending || !preference.presentation.localSelection}
            onClick={() => save(true)}
          >
            {t("clear")}
          </Button>
        ) : null}
      </div>
      {showStateDescription && local.state !== "ready" ? (
        <p role="status" className="text-sm text-fg-muted">
          {t(`state.${local.state}`)}
        </p>
      ) : null}
      {message ? (
        <p role="status" aria-live="polite" className="text-sm text-fg-muted">
          {message}
        </p>
      ) : null}
    </section>
  );
}
