"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { savedViewNameSchema } from "@/lib/keywords/saved-view-model";
import type { CanonicalSavedViewResource } from "@/lib/saved-views/canonical-model";
import { useId, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import type { PersonalSavedViewsControlProps } from "./personal-control-types";

const formSchema = savedViewNameSchema
  .extend({ visibility: z.enum(["private", "project"]) })
  .strict();
type Values = z.infer<typeof formSchema>;

export function PersonalSaveViewModal({
  props,
  onClose,
  onSaved,
}: {
  props: PersonalSavedViewsControlProps;
  onClose: () => void;
  onSaved: (view: CanonicalSavedViewResource) => void;
}) {
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const inFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const nameId = useId();
  const nameErrorId = `${nameId}-error`;
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
    watch,
  } = useForm<Values>({
    defaultValues: { name: "", visibility: "private" },
    resolver: zodResolver(formSchema),
  });
  const busy = isSubmitting || saving;
  const labels = props.labels;
  const visibility = watch("visibility");
  const privateBlocked = !props.canCreatePrivate && visibility === "private";
  async function submit(values: Values) {
    if (values.visibility === "private" && !props.canCreatePrivate) {
      setError("root", { message: labels.privateUnavailable });
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const fingerprint = JSON.stringify({
        config: props.config,
        projectId: props.projectId,
        ...values,
      });
      if (request.current?.fingerprint !== fingerprint)
        request.current = { fingerprint, id: crypto.randomUUID() };
      const result = await props.createAction({
        config: props.config,
        projectId: props.projectId,
        requestId: request.current.id,
        ...values,
      });
      if (!result.ok) throw result.error;
      onSaved(result.value);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      const status =
        error && typeof error === "object" && "status" in error ? error.status : undefined;
      setError("root", {
        message:
          code === "private_view_creation_unavailable"
            ? labels.privateUnavailable
            : status === 409
              ? labels.conflict
              : labels.failed,
      });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      dismissDisabled={busy}
      size="sm"
      title={labels.saveAs}
      footer={
        <>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button
            form="personal-save-view"
            type="submit"
            variant="primary"
            disabled={privateBlocked}
            loading={busy}
            loadingLabel={labels.saving}
          >
            {labels.saveAs}
          </Button>
        </>
      }
    >
      <form id="personal-save-view" className="grid gap-4" onSubmit={handleSubmit(submit)}>
        <label htmlFor={nameId} className="grid gap-2 text-[13px] text-fg">
          {labels.name}
          <Input
            disabled={busy}
            id={nameId}
            className="text-[13px] font-normal leading-5"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? nameErrorId : undefined}
            maxLength={48}
            {...register("name")}
          />
        </label>
        {errors.name ? (
          <p id={nameErrorId} role="alert" className="m-0 text-[12px] text-red-text">
            {errors.name.message}
          </p>
        ) : null}
        <Controller
          control={control}
          name="visibility"
          render={({ field }) => (
            <SegmentedControl
              className="m-0 min-w-0"
              disabled={busy}
              label={labels.visibility}
              labelClassName="text-[13px] text-fg"
              name={field.name}
              onChange={field.onChange}
              options={[
                { value: "private", label: labels.personal, disabled: !props.canCreatePrivate },
                { value: "project", label: labels.project, disabled: !props.canCreateShared },
              ]}
              size="field"
              value={field.value}
            />
          )}
        />
        {!props.canCreatePrivate ? (
          <p role="status" className="m-0 text-[12px] text-fg-muted">
            {props.privateCreationReason ?? labels.privateUnavailable}
          </p>
        ) : null}
        {!props.canCreatePrivate && props.canCreateShared ? (
          <p className="m-0 text-[12px] text-fg-muted">{labels.privateSharing}</p>
        ) : null}
        <p className="m-0 text-[12px] text-fg-muted">{props.scopeSummary}</p>
        {errors.root ? (
          <p role="alert" className="m-0 text-[12px] text-red-text">
            {errors.root.message}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
