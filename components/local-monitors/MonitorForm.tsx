"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type {
  MonitorDetail,
  MonitorSaveResult,
  SaveMonitor,
  SearchMonitorChoices,
  SetupChoices,
} from "@/lib/local-monitors/contracts";
import {
  type MonitorFormValues,
  monitorFormDefaults,
  monitorFormSchema,
} from "@/lib/local-monitors/form-model";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { MonitorCenterPicker } from "./MonitorCenterPicker";
import { MonitorField } from "./MonitorField";
import { MonitorFields } from "./MonitorFields";
import { MonitorGridPreview } from "./MonitorGridPreview";
import { MonitorKeywordPicker } from "./MonitorKeywordPicker";

export function MonitorForm({
  projectId,
  current,
  choices: initialChoices,
  save,
  search,
  onSaved,
  onCancel,
}: {
  projectId: string;
  current?: MonitorDetail | null;
  choices: SetupChoices;
  save: SaveMonitor;
  search: SearchMonitorChoices;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("shared.localMonitors");
  const format = useFormatter();
  const [base] = useState(() => ({ projectId, current }));
  const [choices, setChoices] = useState(initialChoices);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<MonitorSaveResult | null>(null);
  const key = useRef<{ body: string; value: string } | null>(null);
  const form = useForm<MonitorFormValues>({
    resolver: zodResolver(monitorFormSchema),
    defaultValues: monitorFormDefaults(current),
  });
  const locationId = form.watch("locationId");
  const device = form.watch("axes.device");
  const ids = form.watch("keywordIds");
  const size = form.watch("grid.size");
  const subject = choices.subjects.find((row) => row.id === locationId);
  const stale =
    base.projectId !== projectId ||
    base.current?.id !== current?.id ||
    base.current?.version !== current?.version;
  const blocked =
    !choices.permissions.canWrite ||
    current?.state === "archived" ||
    pending ||
    stale ||
    result?.kind === "conflict";
  async function submit(values: MonitorFormValues) {
    if (blocked) return;
    setPending(true);
    setResult(null);
    const body = JSON.stringify({
      projectId: base.projectId,
      id: base.current?.id,
      version: base.current?.version,
      definition: values,
    });
    const request = key.current?.body === body ? key.current : { body, value: crypto.randomUUID() };
    key.current = request;
    try {
      const command = base.current
        ? {
            operation: "revise" as const,
            projectId: base.projectId,
            monitorId: base.current.id,
            expectedVersion: base.current.version,
            definition: values,
            idempotencyKey: request.value,
          }
        : {
            operation: "create" as const,
            projectId: base.projectId,
            definition: values,
            idempotencyKey: request.value,
          };
      const response = await save(command);
      setResult(response);
      if (response.kind === "saved") onSaved(response.receipt.monitorId);
      else key.current = null;
    } catch {
      setResult({ kind: "unavailable" });
    } finally {
      setPending(false);
    }
  }
  async function moreSubjects() {
    if (!choices.nextSubject || pending) return;
    setPending(true);
    try {
      const page = await search({ projectId, search: "", afterSubject: choices.nextSubject });
      setChoices((old) => ({
        ...old,
        subjects: [...old.subjects, ...page.subjects],
        subjectsMore: page.subjectsMore,
        nextSubject: page.nextSubject,
      }));
    } catch {
      setResult({ kind: "unavailable" });
    } finally {
      setPending(false);
    }
  }
  if (!choices.permissions.canRead) return null;
  const keywordChoices = {
    ...choices,
    keywords: [
      ...choices.keywords,
      ...(current?.keywords ?? [])
        .filter((row) => !choices.keywords.some((item) => item.id === row.id))
        .map((row) => ({ ...row, device: current?.axes.device ?? device })),
    ],
  };
  return (
    <Card component="section" className="space-y-4">
      <h2 className="font-semibold">{t(current ? "edit" : "create")}</h2>
      <p className="text-sm text-fg-muted">{t("setupOnly")}</p>
      <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-5">
        <MonitorField label={t("subject")}>
          <MenuSelect
            size="input"
            ariaLabel={t("subject")}
            value={locationId}
            disabled={blocked}
            searchable
            options={choices.subjects.map((row) => ({ value: row.id, label: row.name }))}
            onChange={(value) => {
              const next = choices.subjects.find((row) => row.id === value);
              if (!next) return;
              form.setValue("locationId", next.id, { shouldDirty: true });
              form.setValue("identityRevisionId", next.identityRevisionId, { shouldDirty: true });
            }}
          />
        </MonitorField>
        {!choices.subjects.length ? (
          <p className="text-sm text-fg-muted">{t("noSubjects")}</p>
        ) : null}
        {choices.nextSubject ? (
          <Button
            type="button"
            variant="ghost"
            disabled={blocked}
            onClick={() => void moreSubjects()}
          >
            {t("moreSubjects")}
          </Button>
        ) : null}
        {subject && subject.identityRevisionId !== form.watch("identityRevisionId") ? (
          <Button
            type="button"
            variant="outline"
            disabled={blocked}
            onClick={() => {
              form.setValue("identityRevisionId", subject.identityRevisionId, {
                shouldDirty: true,
              });
            }}
          >
            {t("useCurrentIdentity")}
          </Button>
        ) : null}
        <MonitorCenterPicker form={form} subjects={choices.subjects} disabled={blocked} />
        <MonitorFields form={form} disabled={blocked} />
        <MonitorGridPreview form={form} />
        <MonitorKeywordPicker
          projectId={projectId}
          choices={keywordChoices}
          device={device}
          selected={ids}
          disabled={blocked}
          search={search}
          onChange={(values) => {
            form.setValue("keywordIds", values, { shouldDirty: true });
          }}
        />
        <p className="m-0 text-ui-xs text-fg-muted">
          {t("targetCount", { count: format.number(ids.length * size * size) })}
        </p>
        {Object.keys(form.formState.errors).length ? (
          <p role="alert" className="text-sm text-red-text">
            {t("validation")}
          </p>
        ) : null}
        {stale ? <p role="alert">{t("errors.conflict")}</p> : null}
        {result && result.kind !== "saved" ? (
          <p role="alert" className="text-sm text-red-text">
            {t(`errors.${result.kind}`)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={blocked}>
            {t(pending ? "saving" : "save")}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
