"use client";
import { settingsCardNaturalFrameClassName } from "@/components/settings/shell/settings-layout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  deleteProjectDataCache,
  readProjectDataCache,
  saveProjectDataCache,
} from "@/lib/actions/project-data-cache";
import {
  cacheSettingsSchema,
  type DataCachePage,
  ttlOptions,
} from "@/lib/project-data-cache/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

type Data = z.infer<typeof cacheSettingsSchema>;
type Props = {
  projectId: string;
  canEdit: boolean;
  initial: { ttlSeconds: number | null; page: DataCachePage } | null;
};
export function DataCacheSettings({ projectId, canEdit, initial }: Props) {
  const t = useTranslations("projectSettingsGeneral.dataCache");
  const format = useFormatter();
  const [page, setPage] = useState<DataCachePage>(
    initial?.page ?? { entries: [], cursor: "0", available: false },
  );
  const [loaded, setLoaded] = useState(initial !== null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    "saved" | "error" | "loadError" | "conflict" | "busy" | null
  >(null);
  const form = useForm<Data>({
    resolver: zodResolver(cacheSettingsSchema),
    defaultValues: {
      projectId,
      ttlSeconds: initial?.ttlSeconds ?? null,
      expectedTtlSeconds: initial?.ttlSeconds ?? null,
    },
  });
  function load(cursor = "0") {
    startTransition(async () => {
      setMessage(null);
      try {
        const result = await readProjectDataCache({ projectId, cursor });
        setPage(result.page);
        setLoaded(true);
        form.reset({
          projectId,
          ttlSeconds: result.ttlSeconds,
          expectedTtlSeconds: result.ttlSeconds,
        });
      } catch {
        setMessage("loadError");
      }
    });
  }
  function save(data: Data) {
    startTransition(async () => {
      setMessage(null);
      try {
        const result = await saveProjectDataCache(data);
        setMessage(result.kind === "saved" ? "saved" : "conflict");
        if (result.kind === "saved") {
          form.reset({ ...data, expectedTtlSeconds: result.ttlSeconds });
          setPage((await readProjectDataCache({ projectId })).page);
        }
      } catch {
        setMessage("error");
      }
    });
  }
  function remove(token: string) {
    startTransition(async () => {
      setMessage(null);
      try {
        const result = await deleteProjectDataCache({ projectId, token });
        if (result.kind === "removed")
          setPage((current) => ({
            ...current,
            entries: current.entries.filter((entry) => entry.token !== token),
          }));
        else setMessage(result.kind === "busy" ? "busy" : "error");
      } catch {
        setMessage("error");
      }
    });
  }
  return (
    <Card className={`${settingsCardNaturalFrameClassName} grid gap-4`}>
      <div className="flex items-center gap-1">
        <SectionTitle>{t("title")}</SectionTitle>
        <InfoTooltip text={t("help")} />
      </div>
      <form onSubmit={form.handleSubmit(save)} className="flex flex-wrap items-center gap-2">
        <Controller
          name="ttlSeconds"
          control={form.control}
          render={({ field }) => (
            <MenuSelect
              size="toolbar"
              ariaLabel={t("lifetime")}
              leadingLabel={t("lifetime")}
              disabled={!canEdit || !loaded || pending}
              value={field.value === null ? "default" : String(field.value)}
              onChange={(value) => field.onChange(value === "default" ? null : Number(value))}
              options={[
                { value: "default", label: t("default") },
                ...ttlOptions.map((seconds) => ({
                  value: String(seconds),
                  label:
                    seconds < 86400
                      ? t("hours", { count: seconds / 3600 })
                      : t("days", { count: seconds / 86400 }),
                })),
              ]}
            />
          )}
        />
        <Button
          type="submit"
          size="xs"
          variant="outline"
          disabled={!canEdit || !loaded || pending || !form.formState.isDirty}
        >
          {t("save")}
        </Button>
      </form>
      {!canEdit ? <p className="text-xs text-fg-muted">{t("readOnly")}</p> : null}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{t("list")}</h3>
        <Tooltip content={t("refreshHelp")} semantics="description">
          <Button size="xs" variant="ghost" onClick={() => load()} disabled={pending}>
            {t(page.available ? "refresh" : "retry")}
          </Button>
        </Tooltip>
      </div>
      {!page.available ? (
        <p role="status" className="text-xs text-fg-muted">
          {t(page.entries.length ? "partial" : "unavailable")}
        </p>
      ) : null}
      {page.available && page.entries.length === 0 ? (
        <p className="text-xs text-fg-muted">{t("empty")}</p>
      ) : null}
      {page.entries.length ? (
        <ul className="m-0 list-none p-0 divide-y divide-border-soft rounded-md border border-border-soft">
          {page.entries.map((entry) => (
            <li key={entry.token} className="flex min-w-0 items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="break-words text-sm">
                  {entry.keyword ?? t(`module.${entry.module}`)}
                </p>
                <p className="text-xs text-fg-muted">
                  {t(`module.${entry.module}`)}
                  {entry.module === "keyword_research" ? ` · ${t(`source.${entry.source}`)}` : ""}
                  {entry.provider ? ` · ${entry.provider}` : ""}
                  {entry.country ? ` · ${entry.country}` : ""}
                  {entry.language ? ` / ${entry.language}` : ""}
                </p>
                <p className="text-xs text-fg-muted">
                  {t("expires", {
                    date: format.dateTime(new Date(entry.expiresAt), {
                      dateStyle: "short",
                      timeStyle: "short",
                    }),
                  })}
                </p>
              </div>
              <Button
                size="xs"
                variant="ghost"
                disabled={!canEdit || !loaded || pending}
                onClick={() => remove(entry.token)}
                aria-label={`${t("delete")}: ${entry.keyword ?? t(`module.${entry.module}`)}`}
              >
                {t("delete")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {page.cursor !== "0" ? (
        <Button size="xs" variant="outline" disabled={pending} onClick={() => load(page.cursor)}>
          {t("next")}
        </Button>
      ) : null}
      <p className="text-xs text-fg-muted">{t("notice")}</p>
      {message ? (
        <p role={message === "saved" ? "status" : "alert"} className="text-xs text-fg-muted">
          {t(message)}
        </p>
      ) : null}
    </Card>
  );
}
