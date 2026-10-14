"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { savedViewNameSchema } from "@/lib/keywords/saved-view-model";
import type { CanonicalSavedViewResource } from "@/lib/saved-views/canonical-model";
import { useRef } from "react";
import { useForm } from "react-hook-form";
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
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
    watch,
  } = useForm<Values>({
    defaultValues: { name: "", visibility: "private" },
    resolver: zodResolver(formSchema),
  });
  const labels = props.labels;
  const visibility = watch("visibility");
  const privateBlocked = !props.canCreatePrivate && visibility === "private";
  async function submit(values: Values) {
    if (values.visibility === "private" && !props.canCreatePrivate) {
      setError("root", { message: labels.privateUnavailable });
      return;
    }
    const fingerprint = JSON.stringify({
      config: props.config,
      projectId: props.projectId,
      ...values,
    });
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, id: crypto.randomUUID() };
    try {
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
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      dismissDisabled={isSubmitting}
      size="sm"
      title={labels.saveAs}
      footer={
        <>
          <Button type="button" variant="ghost" disabled={isSubmitting} onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button
            form="personal-save-view"
            type="submit"
            variant="primary"
            disabled={privateBlocked}
            loading={isSubmitting}
            loadingLabel={labels.saving}
          >
            {labels.saveAs}
          </Button>
        </>
      }
    >
      <form
        id="personal-save-view"
        className="grid gap-4"
        onSubmit={handleSubmit((values) => void submit(values))}
      >
        <label className="grid gap-2 text-[13px] text-fg">
          {labels.name}
          <input
            className="rounded-control border border-border-control bg-transparent px-3 py-2 text-fg outline-none focus:border-accent"
            maxLength={48}
            {...register("name")}
          />
        </label>
        {errors.name ? (
          <p role="alert" className="m-0 text-[12px] text-red-text">
            {errors.name.message}
          </p>
        ) : null}
        <fieldset className="flex flex-wrap gap-4 text-[13px] text-fg">
          <legend className="sr-only">{labels.visibility}</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              value="private"
              disabled={!props.canCreatePrivate}
              {...register("visibility")}
            />
            {labels.personal}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              value="project"
              disabled={!props.canCreateShared}
              {...register("visibility")}
            />
            {labels.project}
          </label>
        </fieldset>
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
