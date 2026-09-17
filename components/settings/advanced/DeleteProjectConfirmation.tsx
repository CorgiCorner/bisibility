"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { appPath } from "@/lib/routing/app-path";
import { classifyActionError } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

function confirmationSchema(expected: string, message: string) {
  return z.object({
    confirmText: z.string().refine((value) => value === expected, {
      message,
    }),
  });
}

function deleteProjectError(
  error: unknown,
  t: ReturnType<typeof useTranslations<"projectSettingsAdvanced.danger">>,
  sharedErrors: ReturnType<typeof useSharedErrorMessages>,
) {
  const classified = classifyActionError(error);
  if (classified.kind === "staleDeployment") return sharedErrors.staleDeployment();
  if (classified.kind === "serverComponentDigest") {
    return sharedErrors.serverComponentDigest({ digest: classified.digest });
  }
  return t("deleteError");
}

export function DeleteProjectConfirmation({
  deleteProject,
  domain,
  onClose,
  open,
  projectId,
}: Readonly<DeleteProjectConfirmationProps>) {
  const t = useTranslations("projectSettingsAdvanced.danger");
  const sharedErrors = useSharedErrorMessages();
  const router = useRouter();
  const expected = domain || projectId;
  const form = useForm<{ confirmText: string }>({
    defaultValues: { confirmText: "" },
    mode: "onChange",
    resolver: zodResolver(confirmationSchema(expected, t("mismatch"))),
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
          ? appPath(result.nextProjectPublicId, "dashboard")
          : "/onboarding",
      );
      router.refresh();
    } catch (error) {
      form.setError("root", {
        message: deleteProjectError(error, t, sharedErrors),
        type: "server",
      });
    }
  }

  return (
    <Modal
      footer={
        <>
          <Button onClick={close} size="sm" type="button" variant="ghost">
            {t("cancel")}
          </Button>
          <Button
            disabled={confirmation !== expected}
            form="delete-project-confirmation-form"
            loading={form.formState.isSubmitting}
            loadingLabel={t("deleting")}
            size="sm"
            type="submit"
            variant="destructive"
          >
            {t("delete")}
          </Button>
        </>
      }
      headerDivider
      onClose={close}
      open={open}
      size="md"
      title={t("confirmTitle")}
    >
      <form
        className="space-y-4"
        id="delete-project-confirmation-form"
        onSubmit={form.handleSubmit(submit)}
      >
        <p className="m-0 text-[12.5px] leading-[1.55] text-fg-muted">{t("confirmDescription")}</p>
        <div>
          <label
            className="block font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted"
            htmlFor="delete-project-confirmation"
          >
            {t("typeToConfirm", { expected })}
          </label>
          <Input
            aria-label={t("typeToConfirm", { expected })}
            autoComplete="off"
            className="mt-1.5 font-sans tabular-nums"
            id="delete-project-confirmation"
            placeholder={expected}
            spellCheck={false}
            {...form.register("confirmText")}
          />
          <p className="m-0 mt-1.5 text-[11.5px] text-fg-muted">{t("unavailable")}</p>
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
