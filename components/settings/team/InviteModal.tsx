"use client";

import { useTeamActionError } from "@/components/settings/team/useTeamActionError";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Modal } from "@/components/ui/Modal";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { cn } from "@/lib/ui/cn";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().trim().pipe(z.email()),
  role: z.enum(["admin", "member", "viewer"]),
});

type InviteForm = z.infer<typeof inviteSchema>;
export type InviteAction = (
  input: InviteForm & { projectId: string },
) => Promise<{ inviteLink: string; status?: "success" } | { message: string; status: "error" }>;

export type InviteModalProps = {
  canAssignAdmin?: boolean;
  domain: string;
  open: boolean;
  onClose: () => void;
  inviteMember?: InviteAction;
  onInviteSent?: () => void;
  projectId?: string;
};

export function InviteModal({
  canAssignAdmin = true,
  domain,
  inviteMember,
  onClose,
  onInviteSent,
  open,
  projectId,
}: Readonly<InviteModalProps>) {
  const presentActionError = useTeamActionError();
  const t = useTranslations("projectSettingsTeam");
  const [inviteLink, setInviteLink] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const invitesAvailable = Boolean(inviteMember && projectId);
  const form = useForm<InviteForm>({
    defaultValues: { email: "", role: "member" },
    mode: "onChange",
    resolver: zodResolver(inviteSchema),
  });
  const primaryDisabled =
    !invitesAvailable || !form.formState.isValid || form.formState.isSubmitting || sent;
  const selectedRole = form.watch("role");
  const roleOptions = [
    {
      desc: t("invite.roleDescription.admin"),
      label: t("members.role.admin"),
      value: "admin",
    },
    {
      desc: t("invite.roleDescription.editor"),
      label: t("members.role.editor"),
      value: "member",
    },
    {
      desc: t("invite.roleDescription.viewer"),
      label: t("members.role.viewer"),
      value: "viewer",
    },
  ] as const;
  const availableRoles = canAssignAdmin
    ? roleOptions
    : roleOptions.filter((role) => role.value !== "admin");

  function handleClose() {
    setInviteLink("");
    setSentEmail("");
    setSent(false);
    setSubmitError(null);
    form.reset({ email: "", role: "member" });
    onClose();
  }

  async function onSubmit(values: InviteForm) {
    if (!inviteMember || !projectId) {
      setSubmitError(t("errors.inviteUnavailable"));
      return;
    }

    setSubmitError(null);
    try {
      const result = await inviteMember({ ...values, projectId });
      if (result.status === "error") {
        setSubmitError(presentActionError(result.message, t("errors.inviteSend")));
        return;
      }
      setInviteLink(result.inviteLink);
      setSentEmail(values.email);
      setSent(true);
      onInviteSent?.();
    } catch (error) {
      setSubmitError(presentActionError(error, t("errors.inviteSend")));
    }
  }

  return (
    <Modal
      footer={
        <>
          <Button onClick={handleClose} size="sm" type="button" variant="ghost">
            {sent ? t("invite.done") : t("invite.cancel")}
          </Button>
          {sent ? null : (
            <Button
              disabled={!invitesAvailable || !form.formState.isValid}
              form="invite-teammate-form"
              loading={form.formState.isSubmitting}
              loadingLabel={t("invite.sending")}
              startIcon={<PaperPlaneTilt aria-hidden size={15} weight="regular" />}
              type="submit"
            >
              {t("invite.send")}
            </Button>
          )}
        </>
      }
      onClose={handleClose}
      onPrimaryAction={form.handleSubmit(onSubmit)}
      open={open}
      primaryActionDisabled={primaryDisabled}
      size="md"
      initialFocus={() => form.setFocus("email")}
      title={
        <span className="block">
          <span className="block">{t("invite.title")}</span>
          <span className="mt-[3px] block text-[12.5px] font-normal leading-normal tracking-normal text-fg-muted">
            {t("invite.description", { domain })}
          </span>
        </span>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center px-2 pb-1.5 pt-3.5 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-card bg-green/10 text-green-text">
            <PaperPlaneTilt aria-hidden size={24} weight="regular" />
          </span>
          <div className="mt-3.5 text-[15px] font-semibold text-fg">{t("invite.sentTitle")}</div>
          <p className="m-0 mt-1.5 max-w-[300px] text-[13px] text-fg-muted">
            {t("invite.sentDescription", { email: sentEmail })}
          </p>
          <div className="mt-4 flex w-full items-center gap-2 rounded-control border border-border bg-transparent px-3 py-[9px]">
            <span className="min-w-0 flex-1 truncate font-sans tabular-nums text-[11.5px] text-fg-muted">
              {inviteLink}
            </span>
            <CopyButton label={t("invite.copyLink")} size="md" text={inviteLink} />
          </div>
        </div>
      ) : (
        <form id="invite-teammate-form" onSubmit={form.handleSubmit(onSubmit)}>
          <label
            className="block font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted"
            htmlFor="invite-email"
          >
            {t("invite.email")}
          </label>
          <input
            aria-describedby={form.formState.errors.email ? "invite-email-error" : undefined}
            aria-invalid={Boolean(form.formState.errors.email)}
            className="mt-[7px] min-h-11 w-full rounded-control border border-border-control bg-transparent px-[13px] font-sans tabular-nums text-[13.5px] font-medium text-fg outline-none placeholder:text-[12px] placeholder:leading-4 focus:border-accent"
            id="invite-email"
            inputMode="email"
            placeholder={t("invite.emailPlaceholder")}
            type="email"
            {...form.register("email")}
          />
          {form.formState.errors.email ? (
            <div className="mt-1.5 text-[11.5px] font-medium text-red-text" id="invite-email-error">
              {t("invite.emailInvalid")}
            </div>
          ) : null}
          <div className="mt-4 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            {t("invite.role")}
          </div>
          <div className="mt-[9px] flex flex-col gap-[7px]">
            {availableRoles.map((role) => {
              const active = selectedRole === role.value;
              return (
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-control border-[1.5px] px-[13px] py-[11px]",
                    active ? "border-accent bg-accent-soft" : "border-border-control bg-bg-elev",
                  )}
                  key={role.value}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-fg">{role.label}</span>
                    <span className="mt-px block text-[11.5px] text-fg-muted">{role.desc}</span>
                  </span>
                  <input
                    className="sr-only"
                    type="radio"
                    value={role.value}
                    {...form.register("role")}
                  />
                  <span
                    className={cn(
                      "grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-[1.5px]",
                      active ? "border-accent" : "border-border",
                    )}
                  >
                    <span
                      className={cn(
                        "h-[9px] w-[9px] rounded-full bg-accent",
                        !active && "invisible",
                      )}
                    />
                  </span>
                </label>
              );
            })}
          </div>
          {submitError ? (
            <div className="mt-3 text-[12px] font-medium text-red-text" role="alert">
              {submitError}
            </div>
          ) : null}
        </form>
      )}
    </Modal>
  );
}
