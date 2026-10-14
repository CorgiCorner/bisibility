"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MenuSelect } from "@/components/ui/MenuSelect";
import {
  launchMeasurementSettingsAction,
  previewMeasurementSettingsAction,
  readMeasurementSettingsAction,
  saveMeasurementIntentAction,
  saveMeasurementScheduleAction,
} from "@/lib/actions/measurement-settings-host";
import type { SettingsHostRead } from "@/lib/measurement-settings/host/contracts";
import { measurementRecovery } from "@/lib/measurement-settings/recovery";
import type { LaunchRankCheckRunCreatedResult } from "@/lib/rank-check/runs/launch-types";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { beginMeasurementDraft, type MeasurementDraft } from "./draft";
import { MeasurementRunReceipt } from "./MeasurementRunReceipt";
import { MeasurementSettingsEditor } from "./MeasurementSettingsEditor";
import { createMeasurementTranslator } from "./translate";

const allTargets = { kind: "all", v: 1 } as const;
const ports = {
  preview: previewMeasurementSettingsAction,
  launch: launchMeasurementSettingsAction,
  saveSchedule: saveMeasurementScheduleAction,
  saveIntent: saveMeasurementIntentAction,
};

export function MeasurementSettingsHost({
  projectId,
  initial,
}: Readonly<{ projectId: string; initial: SettingsHostRead }>) {
  const t = useTranslations("shared.measurementSettings"),
    format = useFormatter(),
    router = useRouter();
  const translate = createMeasurementTranslator(t, (value) => format.number(value));
  const [started, setStarted] = useState<LaunchRankCheckRunCreatedResult | null>(null);
  const [read, setRead] = useState(initial);
  const [draft, setDraft] = useState<MeasurementDraft | null>(() =>
    initial.kind === "ready" ? beginMeasurementDraft(initial.snapshot) : null,
  );
  const [pending, setPending] = useState(false),
    [locked, setLocked] = useState(false),
    [readError, setReadError] = useState(false);
  const protectedRead = useRef(false);
  protectedRead.current = locked || pending;
  const focus = useRef<HTMLDivElement>(null);
  const readGeneration = useRef(0);
  useEffect(() => {
    // A fresh server projection updates permissions/conflict evidence without losing an unresolved operation key.
    setRead((current) =>
      protectedRead.current
        ? current.kind === "ready"
          ? { ...current, permissions: initial.permissions }
          : current
        : initial,
    );
  }, [initial]);
  async function reload(scheduleId: string | null, keepDraft = false) {
    if (pending || locked) return;
    const generation = ++readGeneration.current;
    setPending(true);
    setReadError(false);
    try {
      const next = await readMeasurementSettingsAction(projectId, scheduleId);
      if (generation !== readGeneration.current) return;
      setRead(next);
      if (!keepDraft) setDraft(next.kind === "ready" ? beginMeasurementDraft(next.snapshot) : null);
    } catch {
      if (generation === readGeneration.current) setReadError(true);
    } finally {
      if (generation === readGeneration.current) setPending(false);
    }
  }
  if (read.permissions.canRead !== true) return null;
  const recovery = measurementRecovery(
    projectId,
    read.kind === "unavailable" ? read.reason : "source_unavailable",
  );
  return (
    <div id="measurement-settings" tabIndex={-1} ref={focus}>
      {readError ? (
        <p role="alert" className="mb-3 text-sm text-red-text">
          {t("readFailed")}
        </p>
      ) : null}
      {read.kind === "unavailable" || !draft ? (
        <Card>
          <p>
            {t(
              `hostUnavailable.${read.kind === "unavailable" ? read.reason : "source_unavailable"}`,
            )}
          </p>
          <p className="mt-2">
            <a href={recovery.href} className="text-sm text-accent-foreground underline">
              {t(`recovery.${recovery.label}`)}
            </a>
          </p>
          <Button
            className="mt-3"
            variant="outline"
            disabled={pending || locked}
            onClick={() => reload(null)}
          >
            {t("reviewCurrent")}
          </Button>
        </Card>
      ) : (
        <>
          {read.scheduleChoices.length ? (
            <div className="mb-3">
              <MenuSelect
                ariaLabel={t("hostSchedule")}
                leadingLabel={t("hostSchedule")}
                value={read.snapshot.scheduleId ?? ""}
                disabled={pending || locked}
                options={[
                  ...(!read.snapshot.scheduleId
                    ? [{ value: "", label: t("manualOnly"), disabled: true }]
                    : []),
                  ...read.scheduleChoices.map((row) => ({ value: row.id, label: row.label })),
                ]}
                onChange={(id) => {
                  if (read.scheduleChoices.some((row) => row.id === id)) void reload(id);
                }}
              />
            </div>
          ) : null}
          {read.snapshot.nextRun ? (
            <p className="mb-3 text-sm text-fg-muted">
              {read.snapshot.nextRun.at
                ? t("nextRun", {
                    time: format.dateTime(new Date(read.snapshot.nextRun.at), {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: read.snapshot.nextRun.timezone,
                    }),
                    timezone: read.snapshot.nextRun.timezone,
                  })
                : t("nextRunUnknown")}
            </p>
          ) : null}
          {started ? (
            <MeasurementRunReceipt projectId={projectId} result={started} translate={translate} />
          ) : null}
          <MeasurementSettingsEditor
            key={`${projectId}:${read.snapshot.scheduleId ?? "manual"}`}
            projectId={projectId}
            spec={allTargets}
            draft={draft}
            currentSnapshot={read.snapshot}
            choices={read.choices}
            currentRateVersion={read.rateVersion}
            permissions={read.permissions}
            ports={ports}
            onChange={setDraft}
            onBusyChange={setLocked}
            onSaved={(value) => {
              setRead({ ...read, snapshot: value });
              router.refresh();
            }}
            onStarted={(result) => {
              if ("publicId" in result) setStarted(result);
              router.refresh();
            }}
            onRequestCurrent={() => {
              void reload(read.snapshot.scheduleId, true);
            }}
            onCancel={() => setDraft(beginMeasurementDraft(read.snapshot))}
            onFocusReturn={() => focus.current?.focus()}
            translate={translate}
            now={() => new Date()}
            formatCount={(count) => format.number(count)}
            formatDate={(iso, timeZone) =>
              format.dateTime(new Date(iso), {
                dateStyle: "medium",
                timeStyle: "short",
                ...(timeZone ? { timeZone } : {}),
              })
            }
          />
        </>
      )}
    </div>
  );
}
