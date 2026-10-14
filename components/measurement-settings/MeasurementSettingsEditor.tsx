"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import {
  acceptMeasurementQuote,
  beginMeasurementDraft,
  editMeasurementDraft,
  type MeasurementDraft,
  previewRequest,
} from "./draft";
import type { MeasurementSettingsEditorProps } from "./editor-contracts";
import { editorValidation } from "./editor-validation";
import { measurementDraftFormSchema } from "./form";
import { MeasurementActionStatus, measurementBlockMessage } from "./MeasurementActionStatus";
import { MeasurementSelectionEvidence } from "./MeasurementCapabilityEvidence";
import { MeasurementConflictReview } from "./MeasurementConflictReview";
import { MeasurementIntentActions } from "./MeasurementIntentActions";
import { MeasurementQuoteReview } from "./MeasurementQuoteReview";
import { MeasurementScheduleFields } from "./MeasurementScheduleFields";
import { MeasurementSelectionFields } from "./MeasurementSelectionFields";

export type { MeasurementSettingsEditorProps } from "./editor-contracts";

import { reviewedIntentCommand, reviewedManualCommand, reviewedScheduleCommand } from "./commands";
import { useMeasurementActions } from "./use-measurement-actions";

export function MeasurementSettingsEditor(props: MeasurementSettingsEditorProps) {
  const {
    projectId,
    spec,
    draft,
    currentSnapshot,
    choices,
    permissions,
    ports,
    onChange,
    translate: t,
  } = props;
  const id = useId();
  const [resource] = useState(() => ({
    projectId,
    spec: JSON.stringify(spec),
    scheduleId: draft.baseline.scheduleId,
  }));
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const form = useForm<{
    selection: MeasurementDraft["selection"];
    schedule: MeasurementDraft["schedule"];
  }>({
    values: { selection: draft.selection, schedule: draft.schedule },
    resolver: zodResolver(measurementDraftFormSchema),
  });
  const request = previewRequest(draft, projectId, spec);
  const actions = useMeasurementActions({
    request,
    permissions,
    ports,
    onBusyChange: props.onBusyChange,
    onQuote: (requested, quote) =>
      onChange(acceptMeasurementQuote(latestDraft.current, requested, quote)),
    onInvalidate: () => onChange({ ...latestDraft.current, quote: null, acknowledgement: null }),
    onStarted: props.onStarted,
    onScheduleResult: (result) => {
      if (result.kind === "saved") {
        onChange(beginMeasurementDraft(result.value));
        props.onSaved(result.value);
      }
    },
  });
  const sameResource =
    resource.projectId === projectId &&
    resource.spec === JSON.stringify(spec) &&
    resource.scheduleId === currentSnapshot.scheduleId;
  const {
    selectionProblem,
    manualBlock,
    scheduleBlock,
    intentBlock,
    scheduleErrors,
    invalidForm,
    selectionErrorField,
  } = editorValidation({ draft, choices, currentSnapshot }, props, request);
  const frozen = actions.pending || actions.locked || !sameResource;
  function update(update: Parameters<typeof editMeasurementDraft>[1]) {
    if (!frozen) onChange(editMeasurementDraft(draft, update));
  }
  async function readPreview() {
    if (!sameResource || selectionProblem || invalidForm) return;
    await actions.preview();
  }
  if (permissions.canRead !== true) return null;
  if (!sameResource)
    return (
      <Card>
        <p>{t("selectionChanged")}</p>
        <Button
          variant="ghost"
          onClick={() => {
            props.onCancel();
            props.onFocusReturn();
          }}
        >
          {t("cancel")}
        </Button>
      </Card>
    );
  return (
    <Card component="section" aria-labelledby={`${id}-title`} className="min-w-0">
      <h2 id={`${id}-title`} className="font-semibold">
        {t("title")}
      </h2>
      <p className="mt-2 text-sm text-fg-muted">{t("displayHelp")}</p>
      {!permissions.canLaunch && !permissions.canWriteSchedule && !permissions.canWriteIntent ? (
        <p className="mt-2 text-sm text-fg-muted">{t("readOnly")}</p>
      ) : null}
      <form className="mt-4" onSubmit={form.handleSubmit(readPreview)}>
        <MeasurementSelectionFields
          errorId={`${id}-selection-error`}
          errorField={selectionErrorField}
          selection={draft.selection}
          choices={choices}
          disabled={
            frozen ||
            (!permissions.canLaunch && !permissions.canWriteSchedule && !permissions.canWriteIntent)
          }
          translate={t}
          onChange={(selection) => update({ selection })}
        />
        {draft.schedule ? (
          <MeasurementScheduleFields
            id={id}
            errorId={`${id}-form-error`}
            errorFields={scheduleErrors}
            schedule={draft.schedule}
            choices={choices}
            disabled={frozen || !permissions.canWriteSchedule}
            translate={t}
            onChange={(schedule) => update({ schedule })}
          />
        ) : (
          <p className="mt-4 text-sm text-fg-muted">{t("manualOnly")}</p>
        )}
        {selectionProblem ? (
          <p id={`${id}-selection-error`} role="alert" className="mt-3 text-sm text-red-text">
            {measurementBlockMessage(selectionProblem, t)}
          </p>
        ) : null}
        {invalidForm ? (
          <p id={`${id}-form-error`} role="alert" className="mt-3 text-sm text-red-text">
            {t("invalidSettings")}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="outline"
            disabled={frozen || !permissions.canPreview || Boolean(selectionProblem) || invalidForm}
          >
            {t("preview")}
          </Button>
          <Button
            variant="ghost"
            disabled={actions.pending || actions.locked}
            onClick={() => {
              onChange(beginMeasurementDraft(draft.baseline));
              props.onCancel();
              props.onFocusReturn();
            }}
          >
            {t("cancel")}
          </Button>
        </div>
      </form>
      <MeasurementSelectionEvidence choices={choices} selection={draft.selection} translate={t} />
      <MeasurementActionStatus state={actions.state} translate={t} />
      {currentSnapshot.sourceHash !== draft.baseline.sourceHash ||
      currentSnapshot.revision !== draft.baseline.revision ||
      actions.state.phase === "conflict" ? (
        <section className="mt-4">
          <p className="text-sm">
            {t("revisionConflict", {
              base: draft.baseline.revision,
              current: currentSnapshot.revision,
            })}
          </p>
          <p className="mt-2 text-sm text-fg-muted">{t("reviewConflictHelp")}</p>
          <MeasurementConflictReview
            current={currentSnapshot}
            draft={draft}
            choices={choices}
            translate={t}
          />
          <Button
            className="mt-2"
            variant="outline"
            disabled={frozen}
            onClick={props.onRequestCurrent}
          >
            {t("reviewCurrent")}
          </Button>
          {currentSnapshot.sourceHash !== draft.baseline.sourceHash ||
          currentSnapshot.revision !== draft.baseline.revision ? (
            <Button
              className="ml-2 mt-2"
              variant="outline"
              disabled={frozen}
              onClick={() =>
                onChange({
                  ...draft,
                  baseline: beginMeasurementDraft(currentSnapshot).baseline,
                  quote: null,
                  acknowledgement: null,
                })
              }
            >
              {t("keepDraftNewRevision")}
            </Button>
          ) : null}
        </section>
      ) : null}
      {draft.quote && permissions.canPreview ? (
        <MeasurementQuoteReview
          quote={draft.quote}
          translate={t}
          formatDate={props.formatDate}
          formatCount={props.formatCount}
        />
      ) : null}
      {manualBlock && draft.quote && permissions.canPreview ? (
        <p className="mt-3 text-sm text-fg-muted">{measurementBlockMessage(manualBlock, t)}</p>
      ) : null}
      <MeasurementIntentActions
        draft={draft}
        permissions={permissions}
        frozen={frozen}
        manualBlock={manualBlock}
        scheduleBlock={scheduleBlock}
        intentBlock={intentBlock}
        phase={actions.state.phase}
        translate={t}
        onAcknowledgement={(acknowledgement) => onChange({ ...draft, acknowledgement })}
        onLaunch={async () => {
          const command = reviewedManualCommand(draft, request, {
            choices,
            currentRevision: currentSnapshot.revision,
            currentRateVersion: props.currentRateVersion,
            currentSourceHash: currentSnapshot.sourceHash,
            now: props.now(),
          });
          if (!command) {
            onChange({ ...draft, acknowledgement: null });
            return;
          }
          await actions.launch(command);
        }}
        onSaveSchedule={async () => {
          const command = reviewedScheduleCommand(draft, request, {
            choices,
            currentRevision: currentSnapshot.revision,
            currentRateVersion: props.currentRateVersion,
            currentSourceHash: currentSnapshot.sourceHash,
            now: props.now(),
          });
          if (!command) {
            onChange({ ...draft, acknowledgement: null });
            return;
          }
          await actions.saveSchedule(command);
        }}
        onSaveIntent={async () => {
          const command = reviewedIntentCommand(draft, request, {
            choices,
            currentRevision: currentSnapshot.revision,
            currentRateVersion: props.currentRateVersion,
            currentSourceHash: currentSnapshot.sourceHash,
            now: props.now(),
          });
          if (!command) {
            onChange({ ...draft, acknowledgement: null });
            return;
          }
          await actions.saveIntent(command);
        }}
        onRecoverIntent={() => actions.saveIntent()}
        onRecoverLaunch={() => actions.launch()}
        onRecoverSchedule={() => actions.saveSchedule()}
      />
    </Card>
  );
}
