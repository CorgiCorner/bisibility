"use client";

import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { MonitorPage, SetupChoices } from "@/lib/local-monitors/contracts";
import {
  listMonitorsAction,
  saveMonitorAction,
  searchMonitorChoicesAction,
} from "@/lib/local-monitors/session-actions";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MonitorForm } from "./MonitorForm";
import { MonitorList } from "./MonitorList";

export function MonitorWorkspace({
  projectId,
  initialPage,
  choices,
}: {
  projectId: string;
  initialPage: MonitorPage;
  choices: SetupChoices;
}) {
  const t = useTranslations("shared.localMonitors");
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [archive, setArchive] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function load(includeArchived: boolean, more = false) {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const next = await listMonitorsAction(
        projectId,
        more ? (page.nextCursor ?? undefined) : undefined,
        includeArchived,
      );
      setPage((old) => ({
        ...next,
        items: more
          ? [...old.items, ...next.items.filter((row) => !old.items.some((p) => p.id === row.id))]
          : next.items,
      }));
      setArchive(includeArchived);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {choices.permissions.canWrite ? (
          <Button onClick={() => setEditing(true)}>{t("create")}</Button>
        ) : null}
      </div>
      <p className="text-sm text-fg-muted">{t("setupOnly")}</p>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link
          className="text-accent underline-offset-4 hover:underline"
          href={appPath(asProjectRef(projectId), "settings", "business-locations")}
        >
          {t("manageSubjects")}
        </Link>
        <Link
          className="text-accent underline-offset-4 hover:underline"
          href={appPath(asProjectRef(projectId), "integrations")}
        >
          {t("reviewIntegrations")}
        </Link>
      </div>
      {!choices.permissions.canWrite ? (
        <p className="text-sm text-fg-muted">{t("readOnly")}</p>
      ) : null}
      <MenuSelect
        ariaLabel={t("visibility")}
        value={archive ? "all" : "active"}
        disabled={pending}
        options={[
          { value: "active", label: t("activeOnly") },
          { value: "all", label: t("includingArchived") },
        ]}
        onChange={(value) => {
          if (value === "active" || value === "all") void load(value === "all");
        }}
      />
      <MonitorList projectId={projectId} rows={page.items} />
      {page.nextCursor ? (
        <Button variant="outline" disabled={pending} onClick={() => void load(archive, true)}>
          {t("moreMonitors")}
        </Button>
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-red-text">
          {t("readError")}
        </p>
      ) : null}
      {editing && choices.permissions.canWrite ? (
        <MonitorForm
          projectId={projectId}
          choices={choices}
          save={saveMonitorAction}
          search={searchMonitorChoicesAction}
          onCancel={() => setEditing(false)}
          onSaved={(id) =>
            router.push(
              appPath(asProjectRef(projectId), "settings", "business-locations", "monitors", id),
            )
          }
        />
      ) : null}
    </div>
  );
}
