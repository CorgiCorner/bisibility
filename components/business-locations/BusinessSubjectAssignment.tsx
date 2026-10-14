"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { compactInputClassName, Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { BusinessActionStatus } from "./BusinessActionStatus";
import { BusinessSectionHeading } from "./BusinessSectionHeading";
import type {
  AssignLocationCommand,
  AssignmentSummary,
  BusinessCommandPort,
  BusinessReadPermissions,
  BusinessTranslator,
  LocationSummary,
} from "./contracts";
import { reasonFormSchema } from "./prompt-form";
import { useBusinessCommand } from "./use-business-command";

export function BusinessSubjectAssignment({
  projectId,
  assignment,
  current: authorizedCurrent,
  locations,
  permissions,
  translate: t,
  save,
  onSaved,
  onRequestCurrent,
}: {
  projectId: string;
  assignment: AssignmentSummary;
  current?: AssignmentSummary | null;
  locations: readonly LocationSummary[];
  permissions: BusinessReadPermissions;
  translate: BusinessTranslator;
  save: BusinessCommandPort<AssignLocationCommand, AssignmentSummary>;
  onSaved: (assignment: AssignmentSummary) => void;
  onRequestCurrent?: () => void;
}) {
  const id = useId();
  const [base, setBase] = useState({ projectId, assignment });
  const [choice, setChoice] = useState<AssignmentSummary["target"]>(assignment.target);
  const action = useBusinessCommand(save, (command, idempotencyKey) => ({
    ...command,
    idempotencyKey,
  }));
  const form = useForm<{ reason: string }>({
    defaultValues: { reason: "" },
    resolver: zodResolver(reasonFormSchema),
  });
  const eligible = locations.filter(
    (location) => location.state === "active" && location.role === "subject",
  );
  const sameScope =
    projectId === base.projectId &&
    assignment.scope.kind === base.assignment.scope.kind &&
    assignment.scope.id === base.assignment.scope.id;
  const changed = sameScope && assignment.revision > base.assignment.revision;
  const conflict = changed || action.result?.kind === "conflict";
  const current =
    (action.result?.kind === "conflict" ? action.result.current : null) ??
    authorizedCurrent ??
    (changed ? assignment : null);
  const validChoice =
    choice === null ||
    eligible.some(
      (location) =>
        location.publicId === choice.locationId &&
        location.identity.revisionId === choice.identityRevisionId,
    );
  const dirty = JSON.stringify(choice) !== JSON.stringify(base.assignment.target);
  if (permissions.canRead !== true) return null;
  if (!sameScope)
    return (
      <Card>
        <p>{t("selectionChanged")}</p>
      </Card>
    );
  return (
    <Card component="section" aria-labelledby={`${id}-title`}>
      <BusinessSectionHeading
        id={`${id}-title`}
        title={t("assignSubject")}
        summary={t("assignmentSummary")}
        help={t("assignmentHelp")}
        translate={t}
      />
      {!base.assignment.targetAvailable && base.assignment.target ? (
        <p className="mt-2 text-sm text-fg-muted">{t("staleAssignment")}</p>
      ) : null}
      <form
        className="mt-3 flex max-w-xl flex-col items-start gap-3"
        onSubmit={form.handleSubmit(async (values) => {
          if (permissions.canWrite !== true || action.pending || conflict || !validChoice || !dirty)
            return;
          const result = await action.submit({
            projectId: base.projectId,
            scope: base.assignment.scope,
            expectedRevision: base.assignment.revision,
            target: choice,
            reason: values.reason,
          });
          if (result?.kind === "saved") {
            setBase({ projectId: base.projectId, assignment: result.value });
            setChoice(result.value.target);
            form.reset({ reason: "" });
            onSaved(result.value);
          }
        })}
      >
        <div className="w-full min-w-0">
          <p className="m-0 mb-1 text-[12px] font-medium leading-4 text-fg-muted">{t("subject")}</p>
          <MenuSelect
            size="input"
            triggerClassName="min-h-[34px] text-[12px]"
            ariaLabel={t("subject")}
            value={choice?.locationId ?? ""}
            disabled={permissions.canWrite !== true || action.pending}
            options={[
              { value: "", label: t("noSubject") },
              ...eligible.map((location) => ({
                value: location.publicId,
                label: location.identity.name,
                secondary: t("identityRevision", { revision: String(location.identity.revision) }),
              })),
            ]}
            onChange={(value) => {
              if (!value) setChoice(null);
              else {
                const location = eligible.find((row) => row.publicId === value);
                if (location)
                  setChoice({
                    locationId: location.publicId,
                    identityRevisionId: location.identity.revisionId,
                  });
              }
            }}
          />
        </div>
        {!validChoice ? <p className="text-sm text-fg-muted">{t("staleAssignment")}</p> : null}
        <label
          htmlFor={`${id}-reason`}
          className="-mb-2 text-[12px] font-medium leading-4 text-fg-muted"
        >
          {t("fields.reason")}
        </label>
        <Input
          className={compactInputClassName}
          id={`${id}-reason`}
          {...form.register("reason")}
          disabled={permissions.canWrite !== true || action.pending}
          aria-invalid={Boolean(form.formState.errors.reason)}
          aria-describedby={form.formState.errors.reason ? `${id}-reason-error` : undefined}
        />
        {form.formState.errors.reason ? (
          <p id={`${id}-reason-error`} role="alert" className="text-sm text-red-text">
            {t("validation.reason")}
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
        {conflict ? (
          <div>
            <p className="text-sm">
              {current
                ? t("currentAssignment", {
                    name: current.target
                      ? (locations.find((row) => row.publicId === current.target?.locationId)
                          ?.identity.name ?? t("unavailableBranch"))
                      : t("noSubject"),
                    revision: String(current.revision),
                  })
                : t("currentUnavailable")}
            </p>
            {current &&
            current.scope.kind === base.assignment.scope.kind &&
            current.scope.id === base.assignment.scope.id &&
            current.revision >= base.assignment.revision ? (
              <Button
                size="sm"
                variant="outline"
                disabled={permissions.canWrite !== true}
                onClick={() => {
                  setBase({ ...base, assignment: current });
                  action.clearResult();
                }}
              >
                {t("reviewAssignmentKeepChoice")}
              </Button>
            ) : onRequestCurrent ? (
              <Button size="sm" variant="outline" onClick={onRequestCurrent}>
                {t("reviewCurrent")}
              </Button>
            ) : null}
          </div>
        ) : null}
        <Button
          size="sm"
          type="submit"
          disabled={
            permissions.canWrite !== true || action.pending || conflict || !validChoice || !dirty
          }
        >
          {t("saveSubject")}
        </Button>
      </form>
    </Card>
  );
}
