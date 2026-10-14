"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { BusinessActionStatus } from "./BusinessActionStatus";
import { BusinessRevisionReview } from "./BusinessRevisionReview";
import { BusinessSectionHeading } from "./BusinessSectionHeading";
import type {
  BusinessCommandPort,
  BusinessReadPermissions,
  BusinessTranslator,
  CreateLocationCommand,
  LocationSummary,
  ReviseLocationCommand,
} from "./contracts";
import { IdentityFields } from "./IdentityFields";
import {
  type IdentityFormValues,
  identityDefaults,
  identityFormSchema,
  identityInput,
  identityPatch,
  reviewedIdentityDraft,
} from "./identity-form";
import { type CommandWithoutKey, useBusinessCommand } from "./use-business-command";

export type BusinessIdentityEditorProps = {
  projectId: string;
  location?: LocationSummary | null;
  current?: LocationSummary | null;
  permissions: BusinessReadPermissions;
  translate: BusinessTranslator;
  save: BusinessCommandPort<CreateLocationCommand | ReviseLocationCommand, LocationSummary>;
  onSaved: (location: LocationSummary) => void;
  onCancel: () => void;
  onFocusReturn: () => void;
  onRequestCurrent?: () => void;
};
export function BusinessIdentityEditor({
  projectId,
  location = null,
  current,
  permissions,
  translate: t,
  save,
  onSaved,
  onCancel,
  onFocusReturn,
  onRequestCurrent,
}: BusinessIdentityEditorProps) {
  const id = useId();
  const [baseProject] = useState(projectId);
  const [base, setBase] = useState<LocationSummary | null>(location);
  const [blockedIdentity, setBlockedIdentity] = useState<string | null>(null);
  const action = useBusinessCommand(save, (command, idempotencyKey) => ({
    ...command,
    idempotencyKey,
  }));
  const form = useForm<IdentityFormValues>({
    defaultValues: identityDefaults(base?.identity, base?.role),
    resolver: zodResolver(identityFormSchema),
  });
  const strongIdentity = JSON.stringify(form.watch(["cid", "placeId", "mapsUrl"]));
  const blocked =
    (action.result?.kind === "identifier_claimed" || action.result?.kind === "identity_error") &&
    strongIdentity === blockedIdentity;
  const wrongResource =
    projectId !== baseProject ||
    Boolean(location && (!base || location.publicId !== base.publicId));
  const changed = Boolean(location && base && location.identity.revision > base.identity.revision);
  const conflict = action.result?.kind === "conflict" || changed;
  const latest =
    (action.result?.kind === "conflict" ? action.result.current : null) ??
    current ??
    (changed ? location : null);
  const revisionConflict =
    changed ||
    (action.result?.kind === "conflict" &&
      (!action.result.reason || action.result.reason === "revision_conflict"));
  const review =
    revisionConflict &&
    latest &&
    base &&
    latest.publicId === base.publicId &&
    latest.identity.revision >= base.identity.revision &&
    latest.version >= base.version
      ? { latest, previous: base }
      : null;
  const writable =
    permissions.canRead === true &&
    permissions.canWrite === true &&
    (!base || base.state === "active") &&
    (!location || location.state === "active");
  async function submit(values: IdentityFormValues) {
    if (!writable || wrongResource || conflict || blocked || action.pending) return;
    let command: CommandWithoutKey<CreateLocationCommand | ReviseLocationCommand>;
    if (base) {
      const patch = identityPatch(values, base.identity);
      if (!patch) {
        form.setError("root", { message: "validation.noChange" });
        return;
      }
      command = {
        projectId: baseProject,
        locationId: base.publicId,
        expectedRevision: base.identity.revision,
        patch,
        reason: values.reason,
      };
    } else
      command = {
        projectId: baseProject,
        role: values.role,
        identity: identityInput(values),
        reason: values.reason,
      };
    const result = await action.submit(command);
    if (result?.kind === "identifier_claimed" || result?.kind === "identity_error")
      setBlockedIdentity(JSON.stringify([values.cid, values.placeId, values.mapsUrl]));
    if (result?.kind === "saved") {
      setBase(result.value);
      form.reset(identityDefaults(result.value.identity, result.value.role));
      onSaved(result.value);
    }
  }
  if (permissions.canRead !== true) return null;
  if (wrongResource)
    return (
      <Card>
        <p>{t("selectionChanged")}</p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onCancel();
            onFocusReturn();
          }}
        >
          {t("cancel")}
        </Button>
      </Card>
    );
  return (
    <Card component="section" aria-labelledby={`${id}-title`} className="min-w-0">
      <BusinessSectionHeading
        id={`${id}-title`}
        title={t(base ? "editIdentity" : "createLocation")}
        summary={t("identitySummary")}
        help={t("identityVersionHelp")}
        translate={t}
      />
      {!writable ? <p className="mt-2 text-sm text-fg-muted">{t("readOnly")}</p> : null}
      <form className="mt-3" onSubmit={form.handleSubmit(submit)}>
        <IdentityFields
          id={id}
          register={form.register}
          errors={form.formState.errors}
          role={form.watch("role")}
          onRoleChange={(role) => form.setValue("role", role, { shouldDirty: true })}
          roleDisabled={base !== null}
          disabled={!writable || action.pending}
          translate={t}
        />
        {form.formState.errors.root ? (
          <p role="alert" className="mt-3 text-sm text-red-text">
            {t("validation.noChange")}
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
            {review ? (
              <>
                <BusinessRevisionReview
                  current={identityDefaults(review.latest.identity, review.latest.role)}
                  draft={form.getValues()}
                  translate={t}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={permissions.canWrite !== true || review.latest.state !== "active"}
                    onClick={() => {
                      const draft = reviewedIdentityDraft(
                        form.getValues(),
                        review.previous.identity,
                        review.latest,
                      );
                      setBase(review.latest);
                      form.reset(draft);
                      action.clearResult();
                      queueMicrotask(() => form.setFocus("name"));
                    }}
                  >
                    {t("keepChangedFields")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setBase(review.latest);
                      form.reset(identityDefaults(review.latest.identity, review.latest.role));
                      action.clearResult();
                      queueMicrotask(() => form.setFocus("name"));
                    }}
                  >
                    {t("useCurrent")}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-fg-muted">{t("currentUnavailable")}</p>
                {!base ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!writable}
                    onClick={() => {
                      action.clearResult();
                      form.setFocus("name");
                    }}
                  >
                    {t("editConflictingIdentity")}
                  </Button>
                ) : onRequestCurrent ? (
                  <Button variant="outline" onClick={onRequestCurrent}>
                    {t("reviewCurrent")}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            type="submit"
            disabled={!writable || action.pending || conflict || blocked}
          >
            {t("save")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={action.pending}
            onClick={() => {
              form.reset(identityDefaults(base?.identity, base?.role));
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
