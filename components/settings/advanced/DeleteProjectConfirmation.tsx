"use client";

import { Button, Input, Modal } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { appPath } from "@/lib/routing/app-path";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

type DeleteProjectResult = {
  hasRemainingWorkspace: boolean;
  id: string;
  nextProjectPublicId: string | null;
};

export type DeleteProjectAction = (input: {
  confirmText: string;
  projectId: string;
}) => Promise<DeleteProjectResult>;

type DeleteProjectConfirmationProps = {
  deleteProject: DeleteProjectAction;
  domain: string;
  onClose: () => void;
  open: boolean;
  projectId: string;
};

function confirmationSchema(expected: string) {
  return z.object({
    confirmText: z.string().refine((value) => value === expected, {
      message: "Confirmation text does not match this project.",
    }),
  });
}

export function DeleteProjectConfirmation({
  deleteProject,
  domain,
  onClose,
  open,
  projectId,
}: Readonly<DeleteProjectConfirmationProps>) {
  const router = useRouter();
  const expected = domain || projectId;
  const form = useForm<{ confirmText: string }>({
    defaultValues: { confirmText: "" },
    mode: "onChange",
    resolver: zodResolver(confirmationSchema(expected)),
  });
  const confirmation = form.watch("confirmText");

  function close() {
    form.reset({ confirmText: "" });
    onClose();
  }

  async function submit(values: { confirmText: string }) {
    try {
      const result = await deleteProject({ confirmText: values.confirmText, projectId });
      close();
      router.push(
        result.nextProjectPublicId
          ? appPath(result.nextProjectPublicId, "overview")
          : "/onboarding",
      );
      router.refresh();
    } catch (error) {
      form.setError("root", {
        message: actionErrorMessage(error, "Project could not be deleted."),
        type: "server",
      });
    }
  }

  return (
    <Modal
      footer={
        <>
          <Button onClick={close} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={confirmation !== expected}
            form="delete-project-confirmation-form"
            loading={form.formState.isSubmitting}
            loadingLabel="Deleting..."
            size="sm"
            type="submit"
            variant="destructive"
          >
            Delete project
          </Button>
        </>
      }
      headerDivider
      onClose={close}
      open={open}
      size="md"
      title="Confirm project deletion"
    >
      <form
        className="space-y-4"
        id="delete-project-confirmation-form"
        onSubmit={form.handleSubmit(submit)}
      >
        <p className="m-0 text-[12.5px] leading-[1.55] text-fg-muted">
          Delete this project and all of its tracked data. This cannot be undone.
        </p>
        <div>
          <label
            className="block font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted"
            htmlFor="delete-project-confirmation"
          >
            Type {expected} to confirm deletion
          </label>
          <Input
            aria-label={`Type ${expected} to confirm deletion`}
            autoComplete="off"
            className="mt-1.5 font-mono"
            id="delete-project-confirmation"
            placeholder={expected}
            spellCheck={false}
            {...form.register("confirmText")}
          />
          <p className="m-0 mt-1.5 text-[11.5px] text-fg-muted">
            Delete stays unavailable until the text matches.
          </p>
        </div>
        {form.formState.errors.root?.message ? (
          <p className="m-0 text-[12px] text-red-text" role="alert">
            {form.formState.errors.root.message}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
