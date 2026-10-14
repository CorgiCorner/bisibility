"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { BusinessActionStatus } from "./BusinessActionStatus";
import type {
  BusinessCommandPort,
  BusinessReadPermissions,
  BusinessTranslator,
  LocationSummary,
  StateLocationCommand,
} from "./contracts";
import { confirmedPromptSchema } from "./prompt-form";
import { useBusinessCommand } from "./use-business-command";

export function BusinessArchivePrompt({
  projectId,
  location,
  current: authorizedCurrent,
  nextState,
  permissions,
  translate: t,
  save,
  onSaved,
  onCancel,
  onFocusReturn,
  onRequestCurrent,
}: {
  projectId: string;
  location: LocationSummary;
  current?: LocationSummary | null;
  nextState: LocationSummary["state"];
  permissions: BusinessReadPermissions;
  translate: BusinessTranslator;
  save: BusinessCommandPort<StateLocationCommand, LocationSummary>;
  onSaved: (location: LocationSummary) => void;
  onCancel: () => void;
  onFocusReturn: () => void;
  onRequestCurrent?: () => void;
}) {
  const id = useId();
  const [base, setBase] = useState({ projectId, location, nextState });
  const action = useBusinessCommand(save, (command, idempotencyKey) => ({
    ...command,
    idempotencyKey,
  }));
  const form = useForm<{ confirmed: boolean }>({
    defaultValues: { confirmed: false },
    resolver: zodResolver(confirmedPromptSchema),
  });
  const changed = location.version > base.location.version;
  const conflict = changed || action.result?.kind === "conflict";
  const blocked = action.result?.kind === "identifier_claimed";
  const revisionConflict =
    changed ||
    (action.result?.kind === "conflict" &&
      (!action.result.reason || action.result.reason === "revision_conflict"));
  const current =
    (action.result?.kind === "conflict" ? action.result.current : null) ??
    authorizedCurrent ??
    (changed ? location : null);
  const sameResource =
    projectId === base.projectId &&
    location.publicId === base.location.publicId &&
    nextState === base.nextState;
  if (permissions.canRead !== true) return null;
  return (
    <Card component="section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="font-semibold">
        {t(base.nextState === "archived" ? "archive" : "restore")}:{" "}
        {sameResource ? base.location.identity.name : t("selectionChanged")}
      </h2>
      <p className="mt-2 text-sm text-fg-muted">{t("archiveHelp")}</p>
      <form
        className="mt-4"
        onSubmit={form.handleSubmit(async () => {
          if (
            permissions.canWrite !== true ||
            !sameResource ||
            conflict ||
            blocked ||
            action.pending
          )
            return;
          const result = await action.submit({
            projectId: base.projectId,
            locationId: base.location.publicId,
            expectedVersion: base.location.version,
            state: base.nextState,
          });
          if (result?.kind === "saved") {
            setBase({ ...base, location: result.value });
            form.reset({ confirmed: false });
            onSaved(result.value);
          }
        })}
      >
        <Checkbox
          {...form.register("confirmed")}
          aria-invalid={Boolean(form.formState.errors.confirmed)}
          aria-describedby={form.formState.errors.confirmed ? `${id}-confirmed-error` : undefined}
          disabled={permissions.canWrite !== true || action.pending || !sameResource}
          label={t("archiveConfirmation")}
        />
        {form.formState.errors.confirmed ? (
          <p id={`${id}-confirmed-error`} role="alert" className="mt-2 text-sm text-red-text">
            {t("validation.confirmed")}
          </p>
        ) : null}
        <BusinessActionStatus
          result={
            changed && action.result?.kind !== "conflict"
              ? { kind: "conflict", current: null }
              : action.result
          }
          pending={action.pending}
          translate={t}
        />
        {revisionConflict ? (
          <div className="mt-3">
            <p className="text-sm">
              {current
                ? t("currentState", {
                    state: t(`states.${current.state}`),
                    version: String(current.version),
                  })
                : t("currentUnavailable")}
            </p>
            {current &&
            sameResource &&
            current.publicId === base.location.publicId &&
            current.version >= base.location.version ? (
              <Button
                variant="outline"
                disabled={permissions.canWrite !== true}
                onClick={() => {
                  setBase({ ...base, location: current });
                  form.reset({ confirmed: false });
                  action.clearResult();
                }}
              >
                {t("reviewState")}
              </Button>
            ) : onRequestCurrent ? (
              <Button variant="outline" onClick={onRequestCurrent}>
                {t("reviewCurrent")}
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={
              permissions.canWrite !== true ||
              !sameResource ||
              conflict ||
              blocked ||
              action.pending ||
              base.location.state === base.nextState
            }
          >
            {t("confirmAction")}
          </Button>
          <Button
            variant="ghost"
            disabled={action.pending}
            onClick={() => {
              onCancel();
              onFocusReturn();
            }}
          >
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
