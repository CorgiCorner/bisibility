import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import type { MeasurementPermissions, MeasurementTranslator } from "./contracts";
import type { MeasurementDraft } from "./draft";
import { defaultsIntentChanged, scheduleChanged } from "./draft";
import type { MeasurementActionState } from "./use-measurement-actions";

export function MeasurementIntentActions({
  draft,
  permissions,
  frozen,
  manualBlock,
  scheduleBlock,
  intentBlock,
  phase,
  translate: t,
  onAcknowledgement,
  onLaunch,
  onSaveSchedule,
  onRecoverLaunch,
  onRecoverSchedule,
  onSaveIntent,
  onRecoverIntent,
}: {
  draft: MeasurementDraft;
  permissions: MeasurementPermissions;
  frozen: boolean;
  manualBlock: string | null;
  scheduleBlock: string | null;
  intentBlock: string | null;
  phase: MeasurementActionState["phase"];
  translate: MeasurementTranslator;
  onAcknowledgement: (value: MeasurementDraft["acknowledgement"]) => void;
  onSaveIntent: () => Promise<void>;
  onRecoverIntent: () => Promise<void>;
  onLaunch: () => Promise<void>;
  onSaveSchedule: () => Promise<void>;
  onRecoverLaunch: () => Promise<void>;
  onRecoverSchedule: () => Promise<void>;
}) {
  return (
    <>
      {permissions.canWriteIntent ? (
        <section className="mt-5" aria-label={t("saveIntent")}>
          <h2 className="font-semibold">{t("saveIntent")}</h2>
          <p className="mt-2 text-sm text-fg-muted">{t("intentHelp")}</p>
          <p className="mt-2 text-sm">
            {t("defaultDepthReview", {
              current: draft.baseline.defaultIntent.depth,
              chosen: draft.selection.depth,
            })}
          </p>
          <div className="mt-3">
            <Checkbox
              label={t("intentConsent")}
              disabled={
                frozen ||
                !permissions.canPreview ||
                Boolean(intentBlock) ||
                !defaultsIntentChanged(draft)
              }
              checked={draft.acknowledgement === "intent"}
              onChange={(event) => onAcknowledgement(event.currentTarget.checked ? "intent" : null)}
            />
          </div>
          <Button
            className="mt-3"
            disabled={
              frozen ||
              !permissions.canPreview ||
              Boolean(intentBlock) ||
              !defaultsIntentChanged(draft) ||
              draft.acknowledgement !== "intent"
            }
            onClick={onSaveIntent}
          >
            {t("saveIntentButton")}
          </Button>
        </section>
      ) : null}
      <section className="mt-5" aria-label={t("manualLaunch")}>
        <h2 className="font-semibold">{t("manualLaunch")}</h2>
        <div className="mt-3">
          <Checkbox
            label={t("manualConsent")}
            disabled={
              frozen || !permissions.canLaunch || !permissions.canPreview || Boolean(manualBlock)
            }
            checked={draft.acknowledgement === "manual"}
            onChange={(event) => onAcknowledgement(event.currentTarget.checked ? "manual" : null)}
          />
        </div>
        <Button
          className="mt-3"
          disabled={
            frozen ||
            !permissions.canLaunch ||
            !permissions.canPreview ||
            Boolean(manualBlock) ||
            draft.acknowledgement !== "manual"
          }
          onClick={onLaunch}
        >
          {t("launch")}
        </Button>
      </section>
      {draft.schedule && draft.baseline.scheduleId ? (
        <section className="mt-5" aria-label={t("saveSchedule")}>
          <h2 className="font-semibold">{t("saveSchedule")}</h2>
          <div className="mt-3">
            <Checkbox
              label={t("scheduleConsent")}
              disabled={
                frozen ||
                !permissions.canWriteSchedule ||
                !permissions.canPreview ||
                Boolean(scheduleBlock) ||
                !scheduleChanged(draft)
              }
              checked={draft.acknowledgement === "schedule"}
              onChange={(event) =>
                onAcknowledgement(event.currentTarget.checked ? "schedule" : null)
              }
            />
          </div>
          <Button
            className="mt-3"
            disabled={
              frozen ||
              !permissions.canWriteSchedule ||
              !permissions.canPreview ||
              Boolean(scheduleBlock) ||
              !scheduleChanged(draft) ||
              draft.acknowledgement !== "schedule"
            }
            onClick={onSaveSchedule}
          >
            {t("saveScheduleButton")}
          </Button>
        </section>
      ) : null}
      {phase === "intent_unknown" ? (
        <Button
          className="mt-4"
          variant="outline"
          disabled={!permissions.canWriteIntent || !permissions.canPreview}
          onClick={onRecoverIntent}
        >
          {t("recoverIntent")}
        </Button>
      ) : null}
      {phase === "launch_unknown" ? (
        <Button
          className="mt-4"
          variant="outline"
          disabled={!permissions.canLaunch || !permissions.canPreview}
          onClick={onRecoverLaunch}
        >
          {t("recoverLaunch")}
        </Button>
      ) : null}
      {phase === "schedule_unknown" ? (
        <Button
          className="mt-4"
          variant="outline"
          disabled={!permissions.canWriteSchedule || !permissions.canPreview}
          onClick={onRecoverSchedule}
        >
          {t("recoverSchedule")}
        </Button>
      ) : null}
    </>
  );
}
